import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadCards,
  type Color,
  type GameLogEntry,
  type GameState,
  type PlayerId,
  type StockCard,
  type ActionCard,
  type InsiderTipCard
} from '@insider-trading/shared';
import { createGameState } from '../src/domain/setup.js';
import { makeRng } from '../src/domain/rng.js';
import { hashSeed } from '../src/bots/esCore.js';
import { advance } from '../src/engine/advance.js';
import { bid, pass, startAuction } from '../src/engine/auction.js';
import { submitFreeAction } from '../src/engine/freeActions.js';
import { respondToPrompt } from '../src/engine/promptResponse.js';
import { sellStock } from '../src/engine/turn.js';
import { decideBotAction, effectiveBidCeiling, type BotAction } from '../src/bots/decide.js';
import { makeProductionBotProfile, type BotParams } from '../src/bots/botParams.js';
import type { BotProfile } from '../src/bots/profile.js';
import { perceivedCardValue, tipScoreForBot, goalBumpPerStock } from '../src/bots/valuation.js';
import type { ValueNetWeights } from '../src/bots/valueNet.js';

/**
 * Dumps a detailed per-decision trace of production-bot games -- perceived
 * values, bid ceilings, every bid/pass round, and market-movement plays --
 * for manually spotting bad bidding/action-play decisions. See Track 0 of
 * the bot-improvement plan.
 *
 *   tsx scripts/traceBotDecisions.ts [--games 10] [--seats 4] [--seed 31]
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.resolve(HERE, '../../../cards');
const NETS_DIR = path.join(HERE, '..', 'nets');

function flag(name: string, dflt: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : dflt;
}

const GAMES = flag('games', 10);
const SEATS = flag('seats', 4);
const SEED = flag('seed', 31);
const ENDGAME_PROGRESS_MARGIN = 2; // "endgame" = within this many progress ticks of the threshold

const catalog = loadCards(CARDS_DIR);
const net = JSON.parse(fs.readFileSync(path.join(NETS_DIR, 'champion.json'), 'utf8')) as ValueNetWeights;
const baseParams = JSON.parse(fs.readFileSync(path.join(NETS_DIR, 'bot_params.json'), 'utf8')) as BotParams;

function describeCard(card: StockCard | ActionCard): string {
  if (card.category === 'stock') {
    const sc = card as StockCard;
    const typeBit = sc.type === 'blank' || sc.type === 'wild' ? '' : `/${sc.type}`;
    return `${sc.color}${typeBit}`;
  }
  return (card as ActionCard).name;
}

function describeTip(card: InsiderTipCard): string {
  if (card.effect.type === 'halve') return `${card.type} (${card.effect.color} halved)`;
  const parts = Object.entries(card.effect.changes).map(([c, d]) => `${c} ${d! > 0 ? '+' : ''}${d}`);
  return `${card.type} (${parts.join(', ')})`;
}

function findCardInGame(state: GameState, uid: string): StockCard | ActionCard | null {
  for (const c of state.market) {
    if (c.uid === uid && (c.category === 'stock' || c.category === 'action')) return c as StockCard | ActionCard;
  }
  for (const p of state.players) {
    for (const c of p.hand) {
      if (c.uid === uid && (c.category === 'stock' || c.category === 'action')) return c as StockCard | ActionCard;
    }
  }
  return null;
}

function executeBotActionDirect(
  state: GameState,
  playerId: PlayerId,
  action: BotAction,
  events: GameLogEntry[]
): boolean {
  let result;
  switch (action.kind) {
    case 'turn_action':
      result =
        action.action.type === 'start_auction'
          ? startAuction(state, playerId, action.action.cardUid, action.action.initialBid)
          : sellStock(state, playerId, action.action.stockUid);
      break;
    case 'auction_bid':
      result = action.action.type === 'bid' ? bid(state, playerId, action.action.amount) : pass(state, playerId);
      break;
    case 'free_action':
      result = submitFreeAction(state, playerId, action.request);
      break;
    case 'prompt_response':
      result = respondToPrompt(state, playerId, action.promptId, action.response);
      break;
  }
  if (!result.ok) return false;
  events.push(...result.events);
  advance(state, events);
  return true;
}

interface BidRound {
  name: string;
  perceived: number;
  maxBid: number;
  cash: number;
  loans: number;
  action: string;
}

interface AuctionRecord {
  turn: number;
  cardDesc: string;
  cardUid: string;
  auctioneer: string;
  isEndgame: boolean;
  perceivedByAuctioneer: number;
  perceivedByOthers: Array<{ name: string; perceived: number; cash: number; loans: number }>;
  rounds: BidRound[];
  winner: string;
  winningPrice: number;
  tookLoanDuring: boolean;
  winnerGoalBump: number | null; // goalBumpPerStock component of the winner's own valuation, for colored stocks only
}

interface TipPlay {
  turn: number;
  player: string;
  desc: string;
  score: number;
  ownedAffected: Record<string, number>;
  isEndgame: boolean;
}

const underbidFlags: string[] = [];
const endgameOverbidFlags: string[] = [];
const earlyTipFlags: string[] = [];

for (let g = 0; g < GAMES; g++) {
  const seed = SEED * 1000 + g;
  const players = Array.from({ length: SEATS }, (_, i) => ({
    playerId: `p${i}`,
    name: `Bot${i}`,
    isBot: true
  }));
  const state = createGameState({
    catalog,
    players,
    seed,
    gameId: `trace-${seed}`,
    startedAt: '2026-01-01T00:00:00.000Z'
  });
  // createGameState alone doesn't start the setup draft -- production's
  // ServerHub.startGame calls advance() once immediately after to kick it off
  // (beginDraft issues the first round's prompts). See domain/replay.ts.
  advance(state, []);
  const personaRng = makeRng(hashSeed(seed, 7919));
  const tickRng = makeRng(hashSeed(seed, 104729));
  const profiles = new Map<PlayerId, BotProfile>();
  for (const p of players) profiles.set(p.playerId, makeProductionBotProfile(personaRng, net, baseParams));

  const auctionRecords: AuctionRecord[] = [];
  const tipPlays: TipPlay[] = [];
  let currentAuction: AuctionRecord | null = null;
  const allEventsLog: GameLogEntry[] = [];

  let ticks = 0;
  while (!state.gameOver && ticks < 20000) {
    ticks++;
    let acted = false;

    if (state.auction && (!currentAuction || currentAuction.cardUid !== state.auction.cardUid)) {
      const card = findCardInGame(state, state.auction.cardUid);
      if (card) {
        const auctioneer = state.players.find(p => p.playerId === state.auction!.auctioneerId)!;
        const perceiveds: Array<{ name: string; perceived: number; cash: number; loans: number }> = [];
        for (const p of state.players) {
          if (p.playerId === auctioneer.playerId) continue;
          const prof = profiles.get(p.playerId)!;
          perceiveds.push({
            name: p.name,
            perceived: perceivedCardValue(card, state, prof, p.playerId),
            cash: p.cash,
            loans: p.loans
          });
        }
        const aprof = profiles.get(auctioneer.playerId)!;
        const auctioneerPerceived = perceivedCardValue(card, state, aprof, auctioneer.playerId);
        const auctioneerMaxBid = effectiveBidCeiling(auctioneerPerceived, auctioneer.cash, auctioneer.loans, aprof.params);
        currentAuction = {
          turn: state.turnNumber,
          cardDesc: describeCard(card),
          cardUid: state.auction.cardUid,
          auctioneer: auctioneer.name,
          isEndgame: state.progressThreshold - state.progressTracker <= ENDGAME_PROGRESS_MARGIN,
          perceivedByAuctioneer: auctioneerPerceived,
          perceivedByOthers: perceiveds,
          rounds: [
            {
              name: auctioneer.name,
              perceived: auctioneerPerceived,
              maxBid: auctioneerMaxBid,
              cash: auctioneer.cash,
              loans: auctioneer.loans,
              action: `open $${state.auction.initialBid}`
            }
          ],
          winner: '',
          winningPrice: state.auction.initialBid,
          tookLoanDuring: false,
          winnerGoalBump: null
        };
      }
    }

    for (const player of state.players) {
      const profile = profiles.get(player.playerId);
      if (!profile) continue;
      const loansBefore = player.loans;
      const action = decideBotAction(state, player.playerId, profile, { rng: tickRng });
      if (!action) continue;
      const events: GameLogEntry[] = [];

      // Snapshot the bid-round detail *before* executing, using the profile's
      // now-cached perceived value + the exported ceiling fn, so the log shows
      // exactly what the bot was working with when it decided. (The auction's
      // own opening round is seeded when the AuctionRecord is created above --
      // by the time an auction_bid action reaches here, currentAuction always
      // exists.)
      if (currentAuction && action.kind === 'auction_bid') {
        const perceived = profile.auctionCeilings[currentAuction.cardUid] ?? currentAuction.perceivedByAuctioneer;
        const maxBid = effectiveBidCeiling(perceived, player.cash, player.loans, profile.params);
        const actionDesc = action.action.type === 'bid' ? `bid $${action.action.amount}` : 'pass';
        currentAuction.rounds.push({
          name: player.name,
          perceived,
          maxBid,
          cash: player.cash,
          loans: player.loans,
          action: actionDesc
        });
      }

      // Snapshot the tip-play decision *before* executing: the card and the
      // bot's owned-color counts are only available while it's still in hand.
      let pendingTipPlay: TipPlay | null = null;
      if (action.kind === 'free_action' && action.request.kind === 'play_market_movement') {
        const tipCardUid = action.request.cardUid;
        const card = player.hand.find(c => c.uid === tipCardUid) as InsiderTipCard | undefined;
        if (card) {
          const owned: Record<string, number> = {};
          const affectedColors: Color[] = card.effect.type === 'halve' ? [card.effect.color] : (Object.keys(card.effect.changes) as Color[]);
          for (const col of affectedColors) {
            owned[col] = player.hand.filter(c => c.category === 'stock' && c.color === col).length;
          }
          pendingTipPlay = {
            turn: state.turnNumber,
            player: player.name,
            desc: describeTip(card),
            score: tipScoreForBot(state, card, player.playerId),
            ownedAffected: owned,
            isEndgame: state.progressThreshold - state.progressTracker <= ENDGAME_PROGRESS_MARGIN
          };
        }
      }

      const ok = executeBotActionDirect(state, player.playerId, action, events);
      if (!ok) {
        console.log('invalid action by', player.name, JSON.stringify(action));
        process.exit(1);
      }
      allEventsLog.push(...events);

      if (currentAuction && player.loans > loansBefore) currentAuction.tookLoanDuring = true;
      if (pendingTipPlay) tipPlays.push(pendingTipPlay);

      if (currentAuction && !state.auction) {
        const winnerPlayer = state.players.find(p => p.hand.some(c => c.uid === currentAuction!.cardUid));
        const winnerName = winnerPlayer?.name ?? currentAuction.auctioneer;
        let winningPrice = 0;
        for (const r of currentAuction.rounds) {
          const m = r.action.match(/\$(\d+)/);
          if (m) winningPrice = Math.max(winningPrice, Number(m[1]));
        }
        currentAuction.winner = winnerName;
        currentAuction.winningPrice = winningPrice;
        if (winnerPlayer) {
          const wonCard = winnerPlayer.hand.find(c => c.uid === currentAuction!.cardUid);
          const winnerProfile = profiles.get(winnerPlayer.playerId);
          if (wonCard && winnerProfile && wonCard.category === 'stock' && wonCard.color !== 'Wild') {
            currentAuction.winnerGoalBump = goalBumpPerStock(state, wonCard.color, winnerPlayer.playerId, winnerProfile.params);
          }
        }
        auctionRecords.push(currentAuction);
        currentAuction = null;
      }

      acted = true;
      break;
    }
    if (!acted) break;
  }

  // ---- per-game report ----
  console.log(`\n########## GAME seed=${seed} (${SEATS}p) ##########`);
  console.log(
    `Ended after ${ticks} ticks. Turn ${state.turnNumber}. Progress ${state.progressTracker}/${state.progressThreshold}.`
  );

  for (const a of auctionRecords) {
    const allPerceived = [a.perceivedByAuctioneer, ...a.perceivedByOthers.map(o => o.perceived)];
    const maxPerceived = Math.max(...allPerceived);
    const underbid = a.winningPrice < maxPerceived - 5;
    const tag = a.isEndgame ? ' [ENDGAME]' : '';
    console.log(
      `\nT${a.turn}${tag} | ${a.auctioneer} auctions ${a.cardDesc} | perceived(auctioneer)=$${a.perceivedByAuctioneer}` +
        ` | others: ${a.perceivedByOthers.map(o => `${o.name}=$${o.perceived}(cash$${o.cash}/L${o.loans})`).join(', ')}`
    );
    for (const r of a.rounds) {
      console.log(
        `    ${r.name.padEnd(8)} perceived=$${r.perceived} maxBid=$${r.maxBid} cash=$${r.cash} loans=${r.loans} -> ${r.action}`
      );
    }
    const goalBumpStr = a.winnerGoalBump !== null ? ` | winner's goalBump=$${a.winnerGoalBump.toFixed(1)}` : '';
    console.log(`    => WON BY ${a.winner} @ $${a.winningPrice}${a.tookLoanDuring ? ' (took a loan)' : ''}${goalBumpStr}`);
    if (underbid) {
      const line = `seed=${seed} T${a.turn} ${a.cardDesc}: won @ $${a.winningPrice} vs max perceived $${maxPerceived} (gap ${maxPerceived - a.winningPrice})`;
      underbidFlags.push(line);
      console.log(`    !! UNDERBID: paid $${a.winningPrice} but someone perceived $${maxPerceived}`);
    }
    if (a.isEndgame && a.tookLoanDuring) {
      const line = `seed=${seed} T${a.turn} ${a.cardDesc}: took a loan to win an endgame auction @ $${a.winningPrice}`;
      endgameOverbidFlags.push(line);
      console.log(`    !! ENDGAME LOAN: took on debt this close to the end`);
    }
    if (a.isEndgame && a.winnerGoalBump !== null && a.winnerGoalBump > 0 && a.winnerGoalBump >= a.winningPrice * 0.3) {
      const line = `seed=${seed} T${a.turn} ${a.cardDesc}: won @ $${a.winningPrice} with $${a.winnerGoalBump.toFixed(1)} of that from an unrealized goal bump this close to the end`;
      endgameOverbidFlags.push(line);
      console.log(`    !! ENDGAME GOAL-BUMP: $${a.winnerGoalBump.toFixed(1)} of the $${a.winningPrice} price came from a goal that may never get completed`);
    }
  }

  if (tipPlays.length > 0) {
    console.log(`\n-- market-movement plays --`);
    for (const t of tipPlays) {
      const tag = t.isEndgame ? ' [ENDGAME]' : '';
      const ownedStr = Object.entries(t.ownedAffected).map(([c, n]) => `${c}=${n}`).join(', ');
      console.log(`  T${t.turn}${tag} ${t.player} plays ${t.desc} | score=${t.score.toFixed(1)} | owned at play: ${ownedStr}`);
      const maxOwned = Math.max(0, ...Object.values(t.ownedAffected));
      if (maxOwned <= 1) {
        earlyTipFlags.push(`seed=${seed} T${t.turn} ${t.player} played ${t.desc} while holding only ${maxOwned} of the affected color`);
      }
    }
  }

  const goalClaims = allEventsLog.filter(e => e.type === 'goal_claimed');
  if (goalClaims.length > 0) {
    console.log(`\n-- goal claims --`);
    for (const e of goalClaims) console.log(`  T${e.turnNumber} ${e.message}`);
  }
}

console.log(`\n\n========== SUMMARY ACROSS ${GAMES} GAMES ==========`);
console.log(`Underbid auctions (paid >= $5 under someone's perceived value): ${underbidFlags.length}`);
for (const l of underbidFlags) console.log(`  - ${l}`);
console.log(`Endgame loans taken to win an auction: ${endgameOverbidFlags.length}`);
for (const l of endgameOverbidFlags) console.log(`  - ${l}`);
console.log(`Market-movement cards played while holding <=1 of the affected color: ${earlyTipFlags.length}`);
for (const l of earlyTipFlags) console.log(`  - ${l}`);
