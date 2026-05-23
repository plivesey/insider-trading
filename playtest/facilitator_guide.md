# Facilitator Guide — Running AI Playtests (V4)

This guide explains how the main agent (facilitator) runs an AI playtest of Insider Trading V4.

## Setup

1. Run `node playtest/init.js [numPlayers]` to generate `playtest/game_state.json`.
2. This shuffles the 47-card main deck (36 stock + 11 action), draws 5 market cards, builds the Insider Tip deck (2 × players − 1, face-down), selects (players + 2) goals, gives each player $30 and one Hot Tip, and sets all prices to $4.

There is **no End Game Tracker in V4.** The game ends when the Insider Tip deck empties or when only one goal remains in play.

## CRITICAL: Sequential Execution with Individual Player Agents

**Everything in this game MUST be done sequentially. NEVER run anything in parallel. NEVER batch multiple turns or decisions into a single agent call.**

- The facilitator (main agent) runs the game loop and handles ALL game mechanics.
- For each player decision, spawn/resume that player's individual subagent using `Agent` with `model: "haiku"` (see Player Subagents below).
- Do NOT use a generic "simulator" agent to play multiple turns at once. This causes frequent mechanical errors.
- Auctions are multi-round. Each bid must be resolved one at a time — NEVER ask multiple players for bids simultaneously.
- Each turn must fully resolve (action, market refill, ability triggers, dice roll, end-game check) before the next turn begins.

## Player Subagents

- Each player has a personality/rules definition in `.claude/agents/player-{name}.md`.
- To invoke a player, use the `Agent` tool with `model: "haiku"`. On the **first** call, read the player's `.md` file and copy the full personality and rules text into the prompt. This becomes the player's identity for the game.
- **Custom `subagent_type` values do NOT work** — always use the default general-purpose agent type.
- Players respond with a single JSON object — they make decisions only, no file access.
- **Resume agents:** After the first invocation, each player agent returns an `agentId`. Use the `resume` parameter on ALL subsequent calls to that player so it retains memory of previous turns. When resuming, you do NOT need to re-include the personality/rules — just send the new game state and prompt.

## Game Loop

Each turn, the facilitator:

1. **Reads** `game_state.json` to get current state.
2. **Outputs a game state summary** to the user (see Game State Summary below).
3. **Start-of-turn free-action window:** Going in turn order starting with the current player, ask **each** player whether they want to take any free actions — play action card(s), use their Hot Tip, or claim a goal they qualify for. Resolve each one sequentially before moving on. (Free actions are conceptually allowed any time; restricting them to this window keeps facilitation simple.)
4. **Determines** the valid turn action(s) for the current player (auction or sell).
5. **Prompts** that player's subagent (via resume) with visible state.
6. **Validates** the chosen action against the rules.
7. **Applies** the action by editing `game_state.json` (including price moves and special abilities).
8. **Offers goal claims** to any player who now qualifies after stocks changed hands.
9. **Rolls the d6** for the current player and resolves the result.
10. **Checks the end conditions.** If met, finish resolving and end the game.
11. **Advances** to the next player.

## Game State Summary

After every turn, output a summary like this:

```
=== After T[N] — [Player] [action summary] | Die: [roll] ===
Prices: Blue $X, Orange $X, Yellow $X, Purple $X
Insider Tip deck: X left | Goals in play: X
Carnegie: $X cash, [stocks], wealth $X
Astor: $X cash, [stocks], wealth $X
...
Market: [card list]
```

This keeps the user informed of the game state at all times.

## Prompt Templates

### Required State Information (include in EVERY prompt)

Every player prompt MUST include:

1. **Current stock prices** (Blue, Orange, Yellow, Purple).
2. **Player's own state:** cash, stocks in hand (with UIDs and abilities), Wild Shares held, action cards in hand, Hot Tip available?, persistent effects, loans held, goals claimed.
3. **Current wealth:** cash + stock values at current prices − $12 per loan.
4. **Market cards:** all 5 face-up cards with UIDs and descriptions.
5. **Active goals:** unclaimed goals with requirements and rewards.
6. **Other players' visible info:** name, cash, number of stocks (not which), action cards count, loans, goals claimed.
7. **End-game status:** Insider Tip deck count remaining; number of goals still in play.
8. **Valid actions:** list exactly which actions are available.

### Auction Prompts

Auctions use ascending bidding, resolved ONE BID AT A TIME:

1. **Auctioneer picks card and sets an initial price:** Prompt the current player to choose which market card to auction AND name an **initial price** — any amount **$0 or higher** (action: `start_auction`). The initial price is the auctioneer's own committed opening bid.
2. **Bidding rounds:** Starting with the player after the auctioneer, go around. Each player either bids strictly higher than the current high bid (or equal, if they have an active Preferred Bidder) or passes permanently. Continue until all but the high bidder have passed. **If every other player passes, the auctioneer wins the card at the initial price** — an auction always ends in a sale; there is no "no-sale" outcome.
3. **Bids may exceed a player's cash** — that triggers loans on payment (see Loans). Do not cap bids at a player's cash.
4. **For each bid prompt**, include the card, the current high bid and bidder, the player's cash, current prices, the player's hand, and who has passed.

Example bid prompt:
```
AUCTION IN PROGRESS: Orange Boom stock (stock-10)
Current high bid: $3 by Morgan
Players who have passed: Vanderbilt

Current stock prices: Blue $5, Orange $7, Yellow $3, Purple $4

Your cash: $15
Your stocks: 1 Blue Boom, 1 Yellow blank
Your wealth: $15 + $5 + $3 = $23

Bid higher than $3, or pass. You cannot re-enter if you pass.
You may bid above your cash; the shortfall is auto-covered by loans (−$12 each at game end).
```

### Turn Action Prompt

The current player must choose ONE turn action: auction or sell.

```
It's your turn. Choose ONE action:

1. AUCTION: Start an auction on a market card
2. SELL: Sell a stock from your hand for its current price (that color then drops −1)

NOTE: Passing is NOT allowed. If you have no stocks, you must auction.

Current stock prices: Blue $8, Orange $10, Yellow $0, Purple $3
Your cash: $12
Your stocks: Blue Boom (stock-5), Blue blank (stock-2)
...
```

## Applying Actions

### Auction Won
1. Deduct the bid from the winner's cash. If it goes negative, issue loans (see Loans).
2. Move the card from `market` to the winner's `hand`.
3. **If it is a colored stock:** raise that color **+1** (the purchase).
4. Resolve the stock's special ability if any:
   - **Boom:** raise that same color an additional +1.
   - **Tip-Off:** the winner picks a different color to raise +1.
   - **Scout:** the winner looks at the top Insider Tip card (reveal it privately to that player's agent).
   - **Wild Share:** no price move, no ability.
5. Refill the market from `mainDeck` (if `mainDeck` is empty, reshuffle `discardPile` into it).

### Sell
1. Add the stock's current price to the player's cash.
2. Lower that stock's color **−1**.
3. If the stock is an **Informant**, reveal the top Insider Tip card to that player.
4. Move the card from `hand` to `discardPile`.
5. Wild Shares cannot be sold.

### Claim Goal (free, optional, any time)
1. Verify the player holds the required stocks; a Wild Share may substitute for one stock of any one color.
2. Apply the reward.
3. Move the goal from `activeGoals` to the player's `goalsClaimed` (out of play).
4. Stocks used **stay in hand**; any Wild Share used is moved to `discardPile`.
5. **Check the end condition:** if only 1 goal remains in `activeGoals`, the game ends.

### Play Action Card (free, any time)
- Resolve per the card description.
- Single-use: move to `discardPile`.
- **Preferred Bidder** (persistent): add to the player's `persistentEffects`, remove from hand.
- A stock gained via an action card (Corner the Market, Hostile Takeover, Tipster's Choice) is **not "bought"** — no price move and no special ability triggers.

### Roll the Die (end of every turn)
Generate a random integer 1-6:
- **1:** Flip the top `insiderTipDeck` card; resolve its effect on stock prices; remove it from the game (do not discard it back, do not reshuffle). If the deck is now empty, the game ends.
- **6:** All four stock prices +1.
- **2-5:** No effect.

## Loans

- A player may bid/spend beyond their cash.
- When a payment would take a player below $0, issue loan cards in **$10 increments** until the balance is ≥ $0. Each loan added to the player's `loans`.
- Loans are never voluntary and never repaid.
- At game end, each loan counts **−$12** against wealth.

## Endgame

The game ends **immediately** when either:
1. The Insider Tip deck is exhausted (last tip flipped and resolved), OR
2. Only one goal card remains in `activeGoals` (i.e., all but one have been claimed).

When triggered:
1. Finish resolving the current action/roll.
2. **No final turns** — other players do NOT get extra turns.
3. Calculate final wealth: cash + (stocks × current prices) + end-game goal bonuses − $12 per loan.
4. Set `status: "finished"`.
5. Highest total wealth wins. Tiebreaker: most stock cards, then shared victory.

## Key Rules to Remember

- **There is no tracker.** Nothing "advances" anything; the game ends on the two conditions above.
- **Prices have a floor of $0** (they never go negative) — but there is **no maximum**; prices may rise above $10.
- **Every buy raises a color +1; every sell lowers a color −1** — including sells via Pump and Dump and goal rewards. Wild Shares move nothing.
- **"Bought" = won in an auction.** Special abilities and the +1 buy move trigger only on auction wins, not on free/stolen/traded gains.
- **Goal claiming is optional and free** — players choose whether and when to claim.
- **Insider Tips are never held by players** — they only resolve when flipped by a dice roll of 1, then leave the game.
- **Action cards and the Hot Tip are free** — they never cost a turn.

## Tips for Better AI Play

- Remind players of their wealth vs. opponents in prompts.
- Emphasize that buying inflates a price (good if you hold that color) and selling deflates it.
- Surface how close the game is to ending (tip deck count, goals remaining) so players feel timing pressure.
- For action cards, describe concrete value scenarios.

## Saving Results

After each game, copy `game_state.json` to `playtest/results/gameN/` and write an analysis file.

**The analysis file MUST always include an "Insider Tip Peeks" section.** Give a per-peek breakdown of how each player used every peek at the Insider Tip deck (Hot Tip, Scout, Informant, Inside Track, Wiretap): who peeked, what tip they saw, and whether they then acted on that information. Also note unused peeks — Hot Tips never spent, reorder cards never played.

**The analysis file MUST also include a "Purchase Chart" section** — one table per player listing every card that player won at auction. For each entry include:

- **Card** — the card name (e.g. "Purple Boom", "Preferred Bidder", "Corner the Market").
- **Price paid** — the winning bid.
- **Outcome** — what happened with the card. Use whichever applies:
  - *Stock, held at end:* `In hand at end, value: $X (net [+/−]$Y vs. price paid)`
  - *Stock, sold mid-game:* `Sold T[N] for $X (net [+/−]$Y)`
  - *Stock, used for a goal:* `Used to claim [Goal name] (reward $X, net [+/−]$Y)` — still in hand afterwards, so also note its end-game value if applicable.
  - *Single-use action card:* `Played T[N] to [effect]` — and if the card gained another card, list that gained card and its eventual outcome nested underneath. Example: `Corner the Market | $8 | Played T5 → gained Yellow blank, in hand at end, value $5`.
  - *Action card with multiple uses (e.g. Preferred Bidder):* `Used N times: T[a] won X, T[b] won Y, ...`
  - *Unused:* `Never played / still in hand at end`.

Example:

```
### Carnegie's Purchases

| Card              | Price | Outcome                                                        |
|-------------------|-------|----------------------------------------------------------------|
| Purple blank      | $5    | Used to claim Purple Pair (reward $8, net +$3); end value $6   |
| Blue Boom         | $7    | Sold T9 for $9 (net +$2)                                        |
| Preferred Bidder  | $3    | Used 3 times: T4 won Orange blank, T7 won Yellow Scout, T10 won Purple Tip-Off |
| Corner the Market | $8    | Played T5 → gained Yellow blank, in hand at end, value $5      |
| Wild Share        | $2    | Used to claim Three Blues (reward $10), discarded               |
```

Include a one-line **summary** per player after the table: total spent at auction, total realized value, and the net result.
