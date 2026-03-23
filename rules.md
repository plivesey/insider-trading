# Stock Trading Board Game - Rules (V3)

## Overview
A strategic trading and market manipulation game for 2-6 players set in the 1920s era of Wall Street. Players auction stocks, compete for shared goals, and manipulate stock prices using insider information. The game ends when enough market manipulation has occurred, triggering the final reckoning.

---

## Components (72 Cards Total)

### Stock Cards (32 cards)
- **8 Blue**, **8 Orange**, **8 Yellow**, **8 Purple** stock cards
- Per color: 4 blank stocks + 4 special stocks
- Special stock abilities (1 of each per color):
  - **Stock Up**: "When gained, increase any stock by 1"
  - **Stock Down**: "When gained, decrease any stock by 1"
  - **Hype**: "When gained, [color] stock +1. When sold, [color] stock -1"
  - **Insider**: "When gained, draw a Type A card from the pile" (no effect if pile is empty)
- Shuffled into the main deck and auctioned during play

### Type A: Market Manipulation Cards (14 cards)
**TODO: Design these cards**
- Hidden information cards dealt to players at game start
- Each card shows stock price movements (e.g., "Blue +2" or "Orange -1")
- Players play these to manipulate the market
- Distribution by player count:
  - **2-4 players:** Each player gets 2 Type A cards
  - **5-6 players:** Each player gets 1 Type A card
- Remaining undealt cards form a face-down Type A draw pile

### Type B: Action Cards (10 cards)
These special action cards are shuffled into the main deck and auctioned. When won, they go into your hand and are played as a turn action.

1. **"Tipster's Choice"** - Draw 2 cards from deck, keep 1, return other to bottom
2. **"Corner the Market"** - Take any face-up stock from market for free
3. **"Pump and Dump"** - Sell 1 stock at double its current price immediately
4. **"Connected Broker"** - PERSISTENT: For rest of game, gain +$1 per stock when you sell
5. **"Market Manipulation"** - Increase one stock by +2 OR decrease one stock by -2
6. **"Wild Speculation"** - Flip top card from deck, then increase OR decrease that stock by +/-3
7. **"Preferred Bidder"** - PERSISTENT: For rest of game, when you tie the winning bid, you win
8. **"Stock Certificate Forgery"** - Complete any one goal using one fewer card than required
9. **"Hostile Takeover"** - Choose another player, look at their hand, take 1 stock of your choice. They receive $5 from the bank
10. **"Backroom Deal"** - **TODO: Redesign** (currently same as Tipster's Choice)

### Crisis Cards (2 cards)
- **2 Market Crash cards**
- Shuffled into the main deck
- When revealed as a face-up market card, they advance the End Game Tracker by +1
- The crisis card is removed from the game and placed on the tracker pile
- A replacement card is immediately drawn from the deck

### Goal Cards (14 cards)
**TODO: Design these cards**
- Shared objectives displayed face-up at game start
- All players compete to claim these first
- Each shows:
  - Required stocks (e.g., "Own 2 Blues + 1 Yellow")
  - Reward for completion (coins or special effects)
- Number used per game: **number of players + 2**
  - 2 players: 4 goal cards
  - 3 players: 5 goal cards
  - 4 players: 6 goal cards
  - 5 players: 7 goal cards
  - 6 players: 8 goal cards

### Currency & Tracking
- Coin tokens representing money
- **Stock Price Board**: Tracks current prices for all four stocks ($0-$10)
- **End Game Tracker Pile**: Cards placed here track progress toward game end

---

## Setup

1. **Shuffle the main deck**: Combine all stock cards (32), Type B action cards (10), and crisis cards (2) into one 44-card deck
2. **Reveal 5 face-up cards** from the deck (these are available for the first auction round)
3. **Deal Type A cards** to each player:
   - 2-4 players: 2 cards each (private/hidden)
   - 5-6 players: 1 card each (private/hidden)
   - Remaining Type A cards form a face-down draw pile
4. **Display goal cards**: Randomly select and display (players + 2) goal cards face-up in the center
5. **Give each player $25** in coins
6. **Set all stock prices to $5** on the Stock Price Board
7. **Determine first player** randomly

**Players start with ZERO stocks** - all stocks must be acquired through auctions or actions.

---

## Turn Structure

Players take turns clockwise. On your turn, choose ONE action:

### Action 1: Start an Auction
- Choose one of the 5 face-up cards (stock or action card)
- Conduct an **open outcry auction**:
  - Players call out bids freely with no set order (like a real auction house)
  - Highest bidder wins, pays the bank, and takes the card into their hidden hand
  - If the card is a stock with a special ability, the ability triggers immediately
  - Immediately reveal a new card from the deck to replace it (maintain 5 face-up cards)
  - If a crisis card is revealed during replacement, resolve it immediately (see Crisis Cards)

### Action 2: Sell One Stock
- Choose one stock card from your hand
- Sell it to the bank for its current market price
- Receive coins equal to that stock's current price
- If the stock has the **Hype** ability, decrease that color's stock price by 1
- The sold card goes to the **discard pile** (may return via deck reshuffle)

### Action 3: Play a Type A Market Manipulation Card
- Reveal one of your Type A cards from your hand
- **Add the card to the End Game Tracker pile** (+1 to tracker)
- Apply the stock price changes shown on the card
- Stock prices are constrained to $0-$10

### Action 4: Claim a Goal Card
- If you have the required stocks shown on any face-up goal card, you may claim it
- Take the goal card and place it on the **End Game Tracker pile** (+1 to tracker)
- Immediately collect the reward shown on the card
- **The stocks you used stay in your hand** (not discarded)
- Once claimed, that goal is gone - no one else can claim it

### Action 5: Play a Type B Action Card
- Play one Type B action card from your hand
- Resolve its effect immediately
- **Single-use cards** are discarded after use
- **Persistent cards** (Connected Broker, Preferred Bidder) remain in front of you for the rest of the game

---

## Trading (Anytime)

- Players may trade at ANY time, even during another player's turn
- Only current assets can be traded (stocks and coins you currently have)
- No promises or IOUs for future turns
- All trades are binding
- Examples: "I'll trade you 1 Blue and $3 for your Yellow"

---

## End Game Trigger

The game ends when the **End Game Tracker pile reaches (3 x number of players + 1) cards**.

| Players | Tracker Threshold | Goals Available |
|---------|------------------|-----------------|
| 2       | 7                | 4               |
| 3       | 10               | 5               |
| 4       | 13               | 6               |
| 5       | 16               | 7               |
| 6       | 19               | 8               |

**Cards are added to the tracker when:**
- **Playing a Type A card:** +1 (the card itself goes on the pile)
- **Claiming a goal card:** +1 (the goal card goes on the pile)
- **Crisis card revealed:** +1 (crisis card is removed from game to the pile)

**When the tracker reaches its threshold:**
1. Current player finishes their turn
2. Each other player gets **one final turn**
3. Game ends after all final turns

---

## Deck Reshuffle

When the main deck runs out:
- Shuffle the **discard pile** to form a new deck
- Crisis cards that were removed to the tracker pile do NOT return
- Continue play as normal

---

## Determining the Winner

Each player calculates their total wealth:
- **Stock value:** Count all stock cards in hand x current market price per stock
- **Plus cash:** Add all coins held
- **Highest total wealth wins!**

**Tiebreaker:** If tied, the player with more stock cards wins. If still tied, share the victory.

---

## Strategy Tips

- **Start with nothing:** You begin with no stocks, so early auctions establish your strategy
- **Watch the goals:** Shared goals create competition for specific colors
- **Hidden information:** Type A cards are secret, so you can manipulate prices without telegraphing intent
- **Timing matters:** Playing Type A cards advances the end game - sometimes holding them is smarter
- **Goal racing:** Claiming goals gives you the reward AND advances the clock
- **Crisis cards are wild cards:** They can suddenly accelerate the game end
- **Trading is free:** Use it liberally to position yourself for goals or unload unwanted stocks
- **Persistent action cards:** Cards like "Connected Broker" and "Preferred Bidder" pay off over multiple turns
- **Special stocks matter:** Stock abilities trigger when gained - the Insider stock lets you draw more Type A cards

---

## Quick Reference

**Turn Actions (pick 1):**
1. Start an auction (from 5 face-up cards)
2. Sell 1 stock (current market price, to discard)
3. Play a Type A card (+1 end game tracker)
4. Claim a goal card (+1 end game tracker)
5. Play a Type B action card

**Trading:** Anytime, with anyone, current assets only

**End Game Tracker (+1 each):**
- Type A played
- Goal claimed
- Crisis revealed
- **Game ends at:** 3 x players + 1

**Starting Conditions:**
- $25 per player
- Stocks start at $5 each
- 0 stocks in hand (acquire through auctions)
- 5 face-up market cards

---

## Design Notes & TODO

### Completed Design
- Turn structure (5 actions)
- Type B action cards (10 cards, 8 single-use + 2 persistent)
- End game trigger (tracker pile system)
- Card distribution (72 cards total)
- Starting conditions ($25, 0 stocks, all at $5)
- Stock card special abilities (4 types)
- Colorblind-friendly stock colors (Blue, Orange, Yellow, Purple)
- Trading rules (anytime, current assets)
- Deck reshuffle mechanic

### TODO: Type A Market Manipulation Cards (14 cards needed)
- Show stock price movements
- Net-zero balance across all colors
- Varied power levels
- Worth +1 end game point when played

### TODO: Goal Cards (14 cards needed, use players+2 per game)
- Shared/public objectives
- Tiered difficulty with scaled rewards
- Worth +1 end game point when claimed

### TODO: Redesign "Backroom Deal" Type B card
- Currently identical to "Tipster's Choice"
- Needs a unique effect
