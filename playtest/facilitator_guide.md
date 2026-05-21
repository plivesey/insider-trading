# Facilitator Guide — Running AI Playtests

This guide explains how the main agent (facilitator) runs an AI playtest of Insider Trading V3.

## Setup

1. Run `node playtest/init.js [numPlayers]` to generate `playtest/game_state.json`
2. This shuffles the deck, deals insider tips per player (2 each for 2-4p, 1 each for 5-6p), selects goals, draws 5 market cards

## CRITICAL: Sequential Execution with Individual Player Agents

**Everything in this game MUST be done sequentially. NEVER run anything in parallel. NEVER batch multiple turns or decisions into a single agent call.**

- The facilitator (main agent) runs the game loop and handles ALL game mechanics.
- For each player decision, spawn/resume that player's individual subagent using `Agent` with `model: "haiku"` (see Player Subagents below).
- Do NOT use a generic "simulator" agent to play multiple turns at once. This causes frequent mechanical errors.
- Auctions are multi-round. Each bid must be resolved one at a time — NEVER ask multiple players for bids simultaneously.
- Each turn must fully resolve (including market refills, ability triggers, tracker checks) before the next turn begins.

## Player Subagents

- Each player has a personality/rules definition in `.claude/agents/player-{name}.md`.
- To invoke a player, use the `Agent` tool with `model: "haiku"`. On the **first** call, read the player's `.md` file and copy the full personality and rules text into the prompt. This becomes the player's identity for the game.
- **Custom `subagent_type` values do NOT work** — always use the default general-purpose agent type.
- Players respond with a single JSON object — they make decisions only, no file access.
- **Resume agents**: After the first invocation, each player agent returns an `agentId`. Use the `resume` parameter on ALL subsequent calls to that player. This gives the agent memory of previous turns and maintains strategic continuity throughout the game. When resuming, you do NOT need to re-include the personality/rules — just send the new game state and prompt.

## Game Loop

Each turn, the facilitator:

1. **Reads** `game_state.json` to get current state
2. **Outputs a game state summary** to the user (see Game State Summary below)
3. **Determines** valid actions for the current player
4. **Prompts** that player's subagent (via resume) with visible state (see Prompt Templates below)
5. **Validates** the player's chosen action against the rules
6. **Applies** the action by editing `game_state.json`
7. **Handles** special abilities, crisis cards, market refills
8. **Checks** if game end is triggered (tracker >= threshold)
9. **Advances** to next player

## Game State Summary

After every turn, output a summary like this:

```
=== After T[N] — [Player] [action summary] ===
Prices: Blue $X, Orange $X, Yellow $X, Purple $X
Tracker: X/13
Carnegie: $X cash, [stocks], wealth $X
Astor: $X cash, [stocks], wealth $X
Hearst: $X cash, [stocks], wealth $X
Morgan: $X cash, [stocks], wealth $X
Market: [card list]
```

This keeps the user informed of the game state at all times.

## Prompt Templates

### Required State Information (include in EVERY prompt)

Every player prompt MUST include:

1. **Current stock prices** (Blue, Orange, Yellow, Purple)
2. **Player's own state**: cash, stocks in hand (with UIDs and abilities), insider tip cards (with UIDs and effects), persistent effects, goals claimed
3. **Current wealth calculation**: cash + stock values at current prices
4. **Market cards**: all face-up cards with UIDs and descriptions
5. **Active goals**: unclaimed goals with requirements and rewards
6. **Other players' visible info**: name, cash, number of stocks (not which ones), number of insider tips, persistent effects, goals claimed
7. **Tracker status**: current count / threshold
8. **Valid actions**: list exactly which actions are available this turn

### Auction Prompts

Auctions use ascending bidding, resolved ONE BID AT A TIME:

1. **Auctioneer picks card**: Prompt current player to choose which market card to auction (action: `start_auction`)
2. **Bidding rounds**: Go around starting with auctioneer. Each player either bids strictly higher than current high bid (or equal if they have active Preferred Bidder) or passes permanently. Continue until all but one have passed.
3. **For each bid prompt**, include:
   - The card being auctioned (full description)
   - Current high bid and who bid it
   - The player's cash
   - Current stock prices
   - Player's hand
   - Who has passed already

Example bid prompt:
```
AUCTION IN PROGRESS: Orange blank stock (stock-10)
Current high bid: $3 by Morgan
Players who have passed: Vanderbilt

Current stock prices: Blue $5, Orange $7, Yellow $3, Purple $4

Your cash: $15
Your stocks: 1 Blue stock_up, 1 Yellow blank
Your wealth: $15 + $5 + $3 = $23

Bid higher than $3, or pass (bid $0). You cannot re-enter if you pass.
```

### Turn Action Prompt

For non-auction actions (sell, play insider tip, claim goal, play action card), provide the full state and list valid options explicitly.

Example:
```
It's your turn. Choose ONE action:

1. AUCTION: Start an auction on a market card
2. SELL: Sell Blue stock_up (stock-5) for $8
3. PLAY INSIDER TIP: Play "Blue +2 / Orange -1" (itip-53)
4. CLAIM GOAL: You qualify for "2 Blue" — reward: Gain $2

NOTE: Passing is NOT allowed. Players must always take one of the available actions.

Current stock prices: Blue $8, Orange $10, Yellow $0, Purple $3
Your cash: $12
Your stocks: Blue stock_up (stock-5), Blue blank (stock-2)
...
```

## Applying Actions

### Auction Won
1. Deduct cash from winner
2. Move card from `market` to winner's `hand`
3. Trigger stock abilities if applicable (stock_up, demand, hype — these trigger on GAIN)
4. Refill market from `mainDeck` (handle crisis cards: all stock prices +1, then +1 tracker, remove to trackerPile, draw replacement)

### Sell
1. Add current price to player's cash (+ Connected Broker bonus if active)
2. Move card from `hand` to `discardPile`
3. If hype: decrease that color by 1
4. If insider: draw from `insiderTipDeck` (if available)

### Play Insider Tip
1. Apply stock price changes (clamp to 0-10)
2. Move card to `trackerPile`
3. Increment `trackerCount` by 1
4. Check endgame trigger

### Claim Goal
1. Verify player holds required stocks
2. Apply reward
3. Move goal from `activeGoals` to `trackerPile` and add to player's `goalsClaimed`
4. **Stocks stay in player's hand** (not discarded)
5. Increment `trackerCount` by 1
6. Check endgame trigger

### Play Action Card
- Resolve per card description
- Single-use: move to `discardPile`
- Persistent (Connected Broker, Preferred Bidder): add to player's `persistentEffects`, remove from hand
- **Important:** Persistent cards must be PLAYED as a turn action to activate. Winning them in auction puts them in hand — they do NOT activate automatically.
- **Playing action cards does NOT advance the tracker**

## Endgame

When `trackerCount >= trackerThreshold`:
1. The game ends **immediately**
2. The current player finishes resolving their action, then the game is over
3. **No additional turns are given** — other players do NOT get final turns
4. Calculate final wealth: cash + (stocks × current prices) + any end-game bonuses
5. Set `status: "finished"`
6. Highest total wealth wins

## Key Rules to Remember

- **Stock prices**: Always clamp to $0-$10 after any change
- **Tracker advances ONLY for**: insider tip played (+1), goal claimed (+1), crisis card revealed (+1)
- **Playing action cards does NOT advance tracker**
- **Insider stock ability**: Triggers when SOLD, not when gained
- **Hype**: +1 own color when gained, -1 own color when sold
- **Stock_up**: +1 any stock when gained. **Stock_down**: -1 any stock when gained
- **Persistent action cards**: Must be PLAYED as a turn action to activate — do NOT activate when won in auction

## Tips for Better AI Play

- Remind players of their wealth vs opponents in prompts
- Emphasize that stocks at current price are worth bidding near that price
- For action cards, describe concrete value scenarios
- Include the endgame tracker status so players understand timing pressure

## Saving Results

After each game, copy `game_state.json` to `playtest/results/gameN/` and write an analysis file.
