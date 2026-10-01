# Insider Trading — Complete Rules (V6)

> **Design note:** a few numbers below are still open pending more
> playtesting — each is called out inline and tracked in
> `v6_tuning_notes.md`. See `v6_game_length_log.md` for the pacing data
> behind the current dice/threshold numbers.

## Overview

A strategic trading and market-manipulation game for 2-6 players set in the 1920s era of Wall Street. Players auction stocks, race for goals — some public, some secret — and watch the market swing as buying, selling, dice, and a shuffled deck of market-moving tips push prices up and down. Every trade and every completed goal pushes a shared frenzy tracker higher; once it maxes out, the bubble bursts and the richest tycoon wins.

**Players:** 2-6
**Victory:** Highest total wealth (cash + stock value + goal bonuses − loans) when the game ends.

---

## Components (111 cards + 6 dice)

### Market Deck (50 cards)
- **36 stock cards:** 32 colored (8 each of **Blue** [Steel], **Orange** [Oil], **Green** [Rail], **Purple** [Bank] — 4 blank + 4 special per color) + **4 Wild Share** cards (colorless).
- **14 action cards:** one-shot and persistent powers, see Action Cards.
- Shuffled together into one face-down deck; auctioned during play.

### Tip Deck (28 cards)
Market-movement cards only — goal cards live in a separate pool (see Goal Deck below). **12 Crash** ("[Color] halved, round down," 3 per color), **4 Surge** ("[Color] +4," 1 per color), **6 Slump** ("[Color] −2 / [Color] −2" to two colors, all 6 color pairs represented), **6 Shift** ("[Color] +2 / [Color] −2" to two colors, all 6 color pairs represented). Shuffled once at setup; never reshuffled. See Tip Deck below for how cards leave it.

### Goal Deck (19 cards)
- **4 Pair, 4 Three of a Kind, 6 Two Pair, 4 Four of a Kind, 1 Full Spread** — see Goals below.
- All face-up (the public **goal row**) or drafted into a hand (**private**) at setup — see Setup. Goals are never drawn mid-game; the deck that isn't revealed or drafted at setup (the **goal reserve**) just sits face-down, untouched, for the rest of the game.

### Starter Deck (8 cards)
**8 basic stock cards** (2 each of Blue, Orange, Green, Purple — blank, no special ability). Dealt exactly **1 per player** at setup, visible from the start — never part of the draft.

### Loan Cards (6 cards)
Face-up on the table. Auto-issued when a player can't cover a payment. **Max 2 loans per player**: 1st loan costs **−$12** at game end, 2nd (and final) loan costs **−$14**.

### Other
- **A bag of 6 dice** (see Dice below).
- **Coins** representing money.
- **Stock Price Board:** tracks the four stock prices. Floor of **$0**, no maximum.
- **Progress Tracker:** a track from 0 up to the game-end threshold (see Progress Tracker & Game End) — the game's only end condition.

---

## The Special Stocks

Each color has one of each of these four special stocks (16 specials total). The ability triggers only on the printed event:

| Special | Ability |
|---------|---------|
| **Boom** | When **bought**, this stock's color rises an extra **+1** (so its color rises **+2** total this purchase). |
| **Tip-Off** | When **bought**, raise **a different color** of your choice by **+1**. |
| **Scout** | When **bought**, gain the top card of the **tip deck** into your hand. |
| **Informant** | When **bought**, look at the **top 2** cards of the **tip deck**. |

> "When bought" means **won in an auction** (see Buying & Selling). Special abilities do **not** trigger when a stock is gained any other way (free, traded, drafted at setup, or stolen).

### Wild Share Cards (4)
- Colorless. They have **no cash value** and **cannot be sold**.
- A Wild Share sits in your hand. When you claim a Goal (public or private), a Wild Share **may count as one stock of any one color**.
- A Wild Share is **discarded** the moment it is used to claim a Goal (unlike normal stocks, which stay in your hand).
- A Wild Share is auctioned like any other stock, but buying one does **not** move any stock price.

---

## Buying & Selling — Prices Always Move

**Every purchase pushes a price up, every sale pushes a price down.**

- **When a stock is BOUGHT** (won in an auction): that stock's **color rises +1**.
- **When a stock is SOLD** (to the bank): that stock's **color falls −1**.

These moves happen on **every** purchase and **every** sale, including sales made through action cards or goal rewards. Buying or selling a **Wild Share** moves no price (it is colorless). A basic stock from the Starter Deck behaves identically to a blank stock of the same color from the Market Deck — same price track, no special ability.

---

## Setup

1. **Build the market deck:** Shuffle all 36 stock cards and 14 action cards into one **50-card** face-down market deck.
2. **Reveal the market:** Turn up **5 cards** from the market deck side by side.
3. **Reveal starting goals:** Shuffle the 19 goal cards. Reveal **players + 3** of them face-up into the **goal row** (5 at 2 players, up to 9 at 6 — see the table below). Everything left over becomes the face-down **goal reserve**, which only feeds step 5 below — it is never drawn from again for the rest of the game.
4. **Build the tip deck:** Shuffle all 28 market-movement cards into one face-down deck.
5. **Deal starting hands:**
   a. Shuffle the 8-card starter deck and deal exactly **1 basic stock** to each player, straight into their hand, visible immediately (2-6 players → up to 6 cards go unused; permanently removed from the game). This card is never part of the draft.
   b. For each player, count out **2 cards from the tip deck** and **2 cards from the goal reserve** (if the goal reserve has run short — only possible at higher player counts — make up the difference from the tip deck instead, so every player still gets exactly 4 draft candidates).
   c. Combine every player's 4-card pile into one deck and **shuffle it together**, then deal it back out, 4 per player, face-down. (The split per player isn't guaranteed to stay 2-and-2 after this reshuffle.)
6. **Draft down to a hand of 3:**
   a. Each player looks at their 4 cards, **keeps 1**, and passes the other 3 face-down to the player on their left.
   b. Each player looks at the 3-card hand just received, **keeps 1**, and passes the remaining 2 to their left.
   c. Each player looks at the 2-card hand just received, **keeps 1**, and **discards the last card face-down** (removed from the game).
   d. Every player now holds a hand of exactly **3 drafted cards** — plus their starter stock from step 5a, for **4 cards total**. The drafted cards are any mix of tip cards and private goal cards.
7. **Bank:** Give each player **$25**.
8. **Prices:** Set all four stock prices to **$4**.
9. **Loans:** Place the loan cards face-up within reach of all players (max **2 loans per player**).
10. **Progress tracker:** Set to **0**. The game-end threshold is **3 × players + 3** (see Progress Tracker & Game End).
11. **First player:** Choose randomly. Play proceeds clockwise.

| Players | Goals revealed (players + 3) | Progress threshold (3 × players + 3) |
|---|---|---|
| 2 | 5 | 9 |
| 3 | 6 | 12 |
| 4 | 7 | 15 |
| 5 | 8 | 18 |
| 6 | 9 | 21 |

**Players start with $25, a 4-card hand (1 starter stock + 3 drafted), and zero additional stocks beyond that.**

---

## Turn Structure

On your turn you take **exactly one** of these two actions:

### Action A: Start an Auction
1. Choose one of the 5 face-up market cards.
2. **Set an initial price** for it — any amount from **$0** upward. This is your own opening bid: you are committed to buy the card at that price if no one outbids you.
3. Run an **open-outcry auction**: the other players call out ascending bids freely; the highest bidder wins. (You may bid more money than you currently hold — see Loans.) **If every other player passes, you (the auctioneer) buy the card at your initial price** — an auction always ends in a sale.
4. The winner pays the bank and takes the card into their hand.
5. **If the card is a stock:** its color rises **+1** (the purchase). Then resolve its special ability if it has one (Boom, Tip-Off, Scout, Informant). A Wild Share moves no price.
6. Refill the market by revealing a new card from the market deck (back to 5 face-up).

### Action B: Sell One Stock
1. Choose one stock card from your hand (a Wild Share cannot be sold). This can be a stock won at auction or your starting stock — they behave identically.
2. The bank pays you that stock's **current price**.
3. That stock's color falls **−1**.
4. The sold card goes to the **discard pile**.

> You must take one of these two actions on your turn. Passing is not allowed. An auction is always available, so there is always a legal action.

### End of Turn: Draw & Roll a Die
After your action fully resolves, draw one die at random from the bag and roll it — see **Dice** below for the bag and its faces.

Then play passes to the next player.

---

## Things You Can Do Any Time (Free)

The following are **not** turn actions. They are free and may be done at any time — even on another player's turn — and as often as you like:

### Play an Action Card
- Action cards in your hand may be played at any time; they do not cost your turn.
- Resolve the card's effect immediately.
- Most action cards are discarded after use. **Preferred Bidder is persistent** — once played it stays in front of you for the rest of the game.
- Winning a persistent card in an auction only puts it in your hand. You must still **play it** (a free action) to activate it.

### Play a Market-Movement Card From Your Hand
- If you're holding a market-movement card (from your starting draft, or drawn later via Insider Source), you may play it at any time as a free action. It resolves exactly like one drawn from the tip deck, and **bumps the progress tracker by 1**, same as any other market-movement resolution.

### Claim a Goal
- See Goals below. Claiming a goal — public or private — is **optional and free** and never costs your turn.

### Take a Loan
- Loans are issued automatically when you cannot cover a payment (see Loans). You never choose to take one.

---

## Goals

Goal cards can enter play two different ways, and behave differently depending on which:

### Public Goals (the goal row)
- Revealed face-up on the table at setup (see Setup) — **players + 3** to start, and never added to afterward: the goal row only ever shrinks as goals get claimed.
- **Any player** who holds the required stocks may claim a public goal the moment they qualify.
- If a goal could be claimed by more than one player at once (this can only happen right at setup, before anyone's bought any stock), the card is set aside and **all** of them get the reward — it's simply impossible to place one card in front of two players. This is expected to be rare.
- The progress tracker still only goes up by **1** for that claim, even when two players both benefit from it.

### Private Goals (in a player's hand)
- A goal card drafted into a player's hand at setup is **secret**. Only that player knows about it and only they can complete it. There is no way to gain a new private goal after setup — the goal reserve is never drawn from again.
- To claim it, reveal it face-up in front of you (proving you hold it) at the same moment you show you hold the required stocks, then take the reward immediately.
- If you never complete a private goal, nothing happens — it doesn't count for or against you at game end.

### Claiming (both kinds)
- **Claiming is always optional** — you're never forced to claim a goal the moment you qualify; you may wait.
- A **Wild Share** may stand in for one stock of any one color the goal requires.
- Take the reward shown on the goal immediately, and bump the progress tracker by **1**.
- **Your stocks stay in your hand** after claiming — except any Wild Share used, which is discarded.
- Each goal card can be claimed once (aside from the simultaneous-public-claim exception above).

**Goal tiers:**
- **Pair** (4 cards, easy): own 2 of one color.
- **Full Spread** (1 card, medium): own 1 of each of the 4 colors.
- **Three of a Kind** (4 cards, hard): own 3 of one color.
- **Two Pair** (6 cards, hard): own 2 each of two colors.
- **Four of a Kind** (4 cards, very hard): own 4 of one color.

---

## Action Cards (14)

These are shuffled into the **market deck**.

| Card | Effect |
|------|--------|
| **Liquidation** | Sell any number of stocks of a single color; gain **+$1 per stock sold** (each sale still moves that color's price −1 as usual). |
| **Corner the Market** | Take any one face-up market stock for free (not "bought" — no price move, no ability). |
| **Pump and Dump** | Sell 1 stock at **double** its current price. (Still a sale: that color falls −1.) |
| **Preferred Bidder** | **Persistent:** for the rest of the game, when you tie the high bid in an auction, you win the tie. |
| **Hostile Takeover** | Look at another player's hand and take 1 stock of your choice. They draw the top card of the market deck. |
| **Rumor Mill** | Adjust every stock by +1 or −1 (choose one direction for each stock). |
| **Insider Source** | Draw the **top 2 cards** of the **tip deck** into your hand; play each later at any time as a free action. |
| **Foresight** | Look at the top 4 cards of the tip deck. Put them back on top in any order; optionally, move one of the 4 to the bottom of the deck instead of keeping all 4 on top. No card leaves the game either way. |
| **Backroom Deal** | Trade any one card from your hand — a stock, action card, or market-movement card — for any one face-up market card. Your card goes face-up into that market slot and is auctioned normally later like any other market card. Taking the market card this way is a plain swap: no price move, no special ability triggers. |
| **Double Down** | Choose a *different* single-use action card in your hand, resolve its effect **twice**, and discard it. Cannot target a persistent card (Preferred Bidder, a Broker card, etc.). |
| **Oil Broker** | **Persistent:** once played, pay **$2 less** whenever you win an auction for an Oil (Orange) stock (minimum payment $0). Price still moves +1 and any special ability still triggers as normal — only the amount you pay changes. |
| **Rail Broker** | **Persistent:** once played, pay **$2 less** whenever you win an auction for a Rail (Green) stock (minimum payment $0). |
| **Steel Broker** | **Persistent:** once played, pay **$2 less** whenever you win an auction for a Steel (Blue) stock (minimum payment $0). |
| **Bank Broker** | **Persistent:** once played, pay **$2 less** whenever you win an auction for a Bank (Purple) stock (minimum payment $0). |

---

## Tip Deck

The 28-card deck of market-movement cards. It sits face-down; cards leave it only when drawn — by a dice "draw" face, or by **Insider Source**. It is **never reshuffled**. Goal cards are never part of this deck or its draws — see Goal Reserve below.

When a card is drawn from this deck (by dice or Insider Source), resolve its effect immediately and remove it from the game. Bumps the progress tracker by 1.

Special powers **Scout**, **Informant**, and **Foresight** let players peek at (or, for Scout, gain) the top of this deck.

## Goal Reserve

Whatever goal cards weren't revealed into the public goal row at setup (see Setup). Face-down, untouched for the rest of the game — its only role is supplying half of each player's starting draft pool. There is no action or dice face that draws from it during play.

---

## Dice — The Bag of Six

A **bag of 6 dice**. At the end of your turn, draw one die at random from the bag, roll it, and resolve its face. Set that die aside once used — don't return it to the bag. Once all 6 dice have been drawn (over the course of 6 turns), refill the bag with all 6 and keep going. Every 6 turns, each die is rolled exactly once — but you never know what order they'll come in.

| Die | Faces (6 total) |
|---|---|
| Bull-heavy A ×2 | Bull, Bull, Bear, Nothing, Nothing, Nothing |
| Bull-heavy B ×2 | Bull, Bull, Nothing, Nothing, Nothing, Nothing |
| Mixed-draw C ×1 | Nothing, Nothing, Nothing, Nothing, Bull, Draw 1 |
| Draw-heavy D ×1 | Draw 1, Draw 1, Draw 1, Draw 1, Draw 1, Draw 2 |

> **V6 rebalance:** now that the tip deck and goal deck are separate, every "draw" face guarantees a tip card instead of the old merged deck's ~60% chance of one — roughly 1.68× more tracker-advancing value per draw-pip than before. To hold draw-driven pacing roughly constant, total draw-pip volume across the bag was cut to about 60% of its old level: C and D together used to carry 13 draw-pips (across their "Draw 1"/"Draw 2" faces), now 8. Bull/Bear face counts on every die are unchanged — this rebalance only touches draw frequency. See `v6_game_length_log.md` for the measured effect.

**Face effects:**
- **Nothing:** no effect.
- **Bull Market:** all four stock prices rise **+1**.
- **Bear Market:** all four stock prices fall **−1** (floor $0).
- **Draw 1 / Draw 2 Tip(s):** draw that many cards from the top of the tip deck, one at a time, fully resolving each (see Tip Deck above) before revealing the next. Order matters — e.g. a Crash and a same-color Surge drawn together resolve in the order they came up.

If resolving a multi-card draw pushes the progress tracker past its threshold partway through, **finish resolving every card drawn** before the game ends. If the tip deck ever runs out mid-draw, simply resolve whatever cards remain — nothing else happens, and the game is unaffected.

---

## Progress Tracker & Game End

A shared tracker starts at **0** and increases by:
- **+1** for every market-movement card resolved — whether played from a hand as a free action, or drawn via a dice face.
- **+1** for every goal completed — public or private, including a simultaneous public double-claim (still only +1 total for that one claim).

**The game ends the instant the tracker reaches its threshold** — the only end condition.

Threshold is **3 × players + 3**:

| Players | Threshold (3 × players + 3) |
|---------|------------------------------|
| 2 | 9 |
| 3 | 12 |
| 4 | 15 |
| 5 | 18 |
| 6 | 21 |

The current action/turn finishes resolving fully before the game is declared over — there are no partial resolutions and no final turns beyond that.

---

## Loans

You may **bid or spend more money than you currently hold.**

- The instant a payment exceeds your cash, you are **automatically issued loan cards**. Each loan card gives you **$10** immediately. Take as many $10 loans as needed to cover the payment — **up to a maximum of 2 loans per player.** You cannot bid or commit to a payment beyond `cash + (2 − loans held) × $10`.
- Loans are **never taken voluntarily** and **cannot be repaid**.
- A **"Steal $X from each other player"** goal reward (see Goals) works the same way: if a victim can't cover the amount out of cash on hand, they're **automatically issued a loan** to pay it in full, same as any other payment. Once they're already holding 2 loans, they simply pay whatever cash they have left (the shortfall is lost, not owed) — this is the one case in the game where a payment can come up short.
- **End-game cost:** your **1st** loan costs **−$12**, your **2nd** (and final) loan costs **−$14**. Two loans total = −$26.

---

## Determining the Winner

When the game ends, each player totals their wealth:

- **Cash** on hand, plus
- **Stock value:** each colored stock × its current price (Wild Shares are worth $0), plus
- **End-of-game goal bonuses** (e.g., a goal that pays out at game end), minus
- **Loan penalty:** −$12 for a 1st loan, −$14 for a 2nd (max 2 loans per player).

**Highest total wealth wins.**

**Tiebreaker:** most stock cards held. If still tied, share the victory.

---

## Deck Reshuffle

If the **market deck** runs out, shuffle its discard pile to form a new market deck and continue. The **tip deck is never reshuffled** — but since the whole 28-card deck is in circulation from the start, running it dry is expected to be essentially unreachable in a normal game. If it somehow happens, see Dice above.

---

## Quick Reference

**Your turn — pick ONE:**
1. Start an auction
2. Sell one stock

**Then draw & roll a die from the bag** (see Dice) — resolve its face, then it's the next player's turn.

**Any time, free:** play action cards, play a market-movement card from your hand, claim any goal (public or private) you qualify for.

**Prices move:** buy a stock → its color +1; sell a stock → its color −1. (Wild Shares move nothing.)

**Progress tracker:** +1 per market-movement card resolved, +1 per goal completed. **Game ends immediately** when it hits the threshold (3 × players + 3).

**Starting conditions:** $25 cash, a 4-card hand (1 starter stock + 3 drafted), 0 additional stocks; all prices $4; 5 market cards; players+3 public goals to start; progress tracker at 0.

**Wealth = cash + (stocks × price) + end-game goal bonuses − loan penalty (1st loan −$12, 2nd −$14); max 2 loans per player.**
