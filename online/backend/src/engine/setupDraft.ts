import type { GameLogEntry, GameState, HandCard, PlayerId } from '@insider-trading/shared';
import { clearPrompt, setPrompt } from './prompts.js';
import { event } from './events.js';

/**
 * Deal each player's dealt 4-card pile into the transient draft state and
 * issue round-1 `setup_draft_pick` prompts to everyone. Called once by
 * `advance()` the first time it sees `turnPhase === 'setup_draft'`.
 */
export function beginDraft(state: GameState, events: GameLogEntry[]): void {
  const hands: Record<PlayerId, HandCard[]> = {};
  for (const p of state.players) {
    // Alternate's guaranteed starter stock is dealt directly into `hand` at
    // setup (so it's visible to the player immediately) but is never part of
    // the draft pool -- leave it in place and only sweep the rest.
    const keep: HandCard[] = [];
    const draftable: HandCard[] = [];
    for (const c of p.hand) {
      (c.uid.startsWith('alt-starter-stock-') ? keep : draftable).push(c);
    }
    p.hand = keep;
    hands[p.playerId] = draftable;
  }
  state.draft = { round: 1, hands };
  issueDraftPrompts(state, events);
}

function issueDraftPrompts(state: GameState, events: GameLogEntry[]): void {
  const draft = state.draft;
  if (!draft) return;
  for (const p of state.players) {
    const candidates = draft.hands[p.playerId];
    setPrompt(
      state,
      p.playerId,
      'setup_draft_pick',
      `Draft round ${draft.round}: choose 1 card to keep from your ${candidates.length}.`,
      {
        round: draft.round,
        candidateUids: candidates.map(c => c.uid),
        // Full card objects too (not just uids) -- during the draft, a
        // player's `hand` holds at most their Alternate starter stock (if
        // any); the draft candidates themselves live only in state.draft,
        // which isn't part of the client projection, so the client has no
        // other way to know what these cards actually are. Safe to include
        // in full: this prompt is only ever delivered to the one player it
        // belongs to.
        candidates
      }
    );
  }
  events.push(
    event('draft_round_started', `Setup draft round ${draft.round} begins`, { payload: { round: draft.round } })
  );
}

/**
 * Handle a `setup_draft_pick` prompt response: move the chosen card into the
 * player's permanent hand, then -- once every player has picked for this
 * round -- either rotate the remaining candidates left and start the next
 * round, or (after round 3) finish the draft and start the game proper.
 */
export function handleDraftPick(
  state: GameState,
  playerId: PlayerId,
  keepUid: string,
  events: GameLogEntry[]
): { ok: boolean; error?: string } {
  const draft = state.draft;
  if (!draft) return { ok: false, error: 'no active draft' };
  const candidates = draft.hands[playerId];
  if (!candidates) return { ok: false, error: 'no draft candidates for this player' };
  const idx = candidates.findIndex(c => c.uid === keepUid);
  if (idx < 0) return { ok: false, error: 'card not among your draft candidates' };
  const kept = candidates.splice(idx, 1)[0];
  const player = state.players.find(p => p.playerId === playerId)!;
  player.hand.push(kept);
  clearPrompt(state, playerId);
  events.push(
    event('draft_pick', `${player.name} keeps a card (round ${draft.round})`, {
      actor: playerId,
      payload: { round: draft.round, keptUid: kept.uid }
    })
  );

  // Final round: whatever's left after keeping 1 of the final 2 is discarded
  // automatically -- there's no third choice to make.
  if (draft.round === 3 && candidates.length > 0) {
    const discarded = candidates.splice(0, candidates.length);
    events.push(
      event('draft_discard', `${player.name}'s undrafted card is discarded`, {
        actor: playerId,
        payload: { uids: discarded.map(c => c.uid) }
      })
    );
  }

  const allDone = state.players.every(p => state.pendingPrompts[p.playerId] === null);
  if (allDone) {
    if (draft.round < 3) {
      rotateAndAdvanceRound(state, events);
    } else {
      finishDraft(state, events);
    }
  }
  return { ok: true };
}

function rotateAndAdvanceRound(state: GameState, events: GameLogEntry[]): void {
  const draft = state.draft!;
  const n = state.players.length;
  const newHands: Record<PlayerId, HandCard[]> = {};
  for (let i = 0; i < n; i++) {
    const from = state.players[i].playerId;
    const to = state.players[(i + 1) % n].playerId;
    newHands[to] = draft.hands[from];
  }
  draft.hands = newHands;
  draft.round = (draft.round + 1) as 2 | 3;
  issueDraftPrompts(state, events);
}

function finishDraft(state: GameState, events: GameLogEntry[]): void {
  state.draft = null;
  state.turnPhase = 'awaiting_turn_action';
  events.push(event('draft_complete', 'Setup draft complete', {}));
}
