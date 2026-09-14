# Insider Trading — Complete Rules (V5)

> **Design note:** V5 is under active development. A few numbers below are
> placeholders pending playtesting — each is called out inline and tracked
> in `v5_tuning_notes.md`. Two action cards (**Insider Source**, **Black
> Market**) also need a confirmed rewrite now that the event deck has
> merged with the goal deck — see the callouts under Action Cards.

## Overview

A strategic trading and market-manipulation game for 2-6 players set in the 1920s era of Wall Street. Players auction stocks, race for goals — some public, some secret — and watch the market swing as buying, selling, dice, and a shuffled deck of market-moving events push prices up and down. Every trade and every completed goal pushes a shared frenzy tracker higher; once it maxes out, the bubble bursts and the richest tycoon wins.

**Players:** 2-6
**Victory:** Highest total wealth (cash + stock value + goal bonuses − loans) when the game ends.

---

## Components (113 cards + 6 dice)

### Market Deck (53 cards)
- **36 stock cards:** 32 colored (8 each of **Blue** [Steel], **Orange** [Oil], **Green** [Rail], **Purple** [Bank] — 4 blank + 4 special per color) + **4 Wild Share** cards (colorless).
- **17 action cards:** one-shot and persistent powers (13 carried over from V4 + 4 new persistent Broker cards, see Action Cards).
- Shuffled together into one face-down deck; auctioned during play exactly as in V4.

> **Changed in V5:** the fourth stock color is now **Green** (Rail-themed), replacing V4's Yellow.

### Event Deck (30 cards)
The old Insider Tip deck and Goal deck are now **one shuffled deck**:
- **16 market-movement cards** — 8 crash, 4 surge, 4 slump (same as V4's Insider Tips).
- **14 goal cards** — 4 pair, 4 three-of-a-kind, 6 two-pair (same as V4's goals).

Cards from this deck can end up **public** (face-up in the goal row, or resolved immediately if a market-movement card) or **private** (held secretly in a player's hand) depending on how they enter play — see Setup and Goals below.

### Starter Deck (24 cards — setup only)
Used only to build starting hands, then **set aside for the rest of the game**:
- **12 basic stock cards:** 3 each of Blue, Orange, Green, Purple (blank, no special ability — newly printed cards, separate from the Market Deck's stocks).
- **12 starter action cards**, of two kinds — see Starter Action Cards below.

### Loan Cards (6 cards)
Face-up on the table. Auto-issued when a player can't cover a payment. **Max 2 loans per player**: 1st loan costs **−$12** at game end, 2nd (and final) loan costs **−$14**.

> **Changed in V5:** V4's 3-loan cap with a uniform +$1-per-loan escalation ($12 / $13 / $14) is replaced by a 2-loan cap at $12 then $14.

### Removed from V5
- **Hot Tip cards** (the starting single-use "peek the top event card" power) no longer exist.
- **Market Order** (the starting "buy a stock free" card) no longer exists. The drafted starting hand (see Setup) replaces both.

### Other
- **A bag of 6 dice** (see Dice below) — replaces V4's single d6.
- **Coins** representing money.
- **Stock Price Board:** tracks the four stock prices. Floor of **$0**, no maximum.
- **Progress Tracker:** a new track from 0 up to the game-end threshold (see Progress Tracker & Game End).

---

## The Special Stocks

Each color has one of each of these four special stocks (16 specials total). The ability triggers only on the printed event:

| Special | Ability |
|---------|---------|
| **Boom** | When **bought**, this stock's color rises an extra **+1** (so its color rises **+2** total this purchase). |
| **Tip-Off** | When **bought**, raise **a different color** of your choice by **+1**. |
| **Scout** | When **bought**, look at the **top 1** card of the event deck. |
| **Informant** | When **bought**, look at the **top 2** cards of the event deck. |

> **Changed in V5:** Informant used to trigger on sell and peek 1 card; it now triggers on **buy**, same as Scout, and peeks **2** cards instead of 1.
>
> "When bought" means **won in an auction** (see Buying & Selling). Special abilities do **not** trigger when a stock is gained any other way (free, traded, drafted at setup, or stolen).

### Wild Share Cards (4)
- Colorless. They have **no cash value** and **cannot be sold**.
- A Wild Share sits in your hand. When you claim a Goal (public or private), a Wild Share **may count as one stock of any one color**.
- A Wild Share is **discarded** the moment it is used to claim a Goal (unlike normal stocks, which stay in your hand).
- A Wild Share is auctioned like any other stock, but buying one does **not** move any stock price.

---

## Starter Action Cards (12)

These 12 cards only exist in the Starter Deck (see Components/Setup) — once drafted into a hand, they behave like any other action card, except for the 5 "hidden" ones noted below. Names are new for V5 and open to change.

**Played normally** — free action, any time, discarded after use:

| Card | Effect |
|---|---|
| **Fire Sale** | Buy any one face-up market stock for a flat **$3**, regardless of its listed price. This is *not* a normal "buy": no price move, no special ability triggers. |
| **First Look** | Draw the top card of the market deck into your hand. |
| **Foresight** | Look at the top 4 cards of the event deck. Put them back on top in any order; optionally, move one of the 4 to the bottom of the deck instead of keeping all 4 on top. No card leaves the game either way. |
| **Windfall** | Gain $5 from the bank. |
| **Market Panic** | Every other player loses $3. A player with less than $3 just drops to $0 — this does **not** trigger a loan. |
| **Backroom Deal** | Trade any one card from your hand — a stock, action card, market-movement card, or even a private goal — for any one face-up market card. Your card goes face-up into that market slot and is auctioned normally later like any other market card (the winner takes it into their hand — a private goal or a playable market-movement card, as applicable). Taking the market card this way is a plain swap: no price move, no special ability triggers. Note this exposes the traded card's identity to the whole table, even if it was a private goal. |
| **Double Down** | Pay $2 to the bank (this can trigger a loan if you can't cover it) — then choose a *different* single-use action card in your hand, resolve its effect **twice**, and discard it. Cannot target a persistent card (Preferred Bidder, a Broker card, etc.) or any of the 5 hidden end-game bonus cards below — none of those are ever "played" in the normal sense. |

**Hidden end-game bonus cards** — never played. Keep them secret in your hand for the whole game; each one scores automatically at final wealth calculation (see Determining the Winner) whether or not you ever reveal it beforehand:

| Card | Effect at game end |
|---|---|
| **Nest Egg** | Worth a flat **+$7**. |
| **Portfolio** | **+$2** for every stock card you hold (Wild Shares count). |
| **Trophy Case** | **+$3** for every goal you've completed — public or private claims both count; an unclaimed private goal does not. |
| **Clean Ledger** | **+$10** if you took zero loans the entire game. |
| **Easy Credit** | Every loan you took costs a flat **−$10** at game end instead of the normal −$12 / −$14. |

---

## Buying & Selling — Prices Always Move

This is unchanged from V4: **every purchase pushes a price up, every sale pushes a price down.**

- **When a stock is BOUGHT** (won in an auction): that stock's **color rises +1**.
- **When a stock is SOLD** (to the bank): that stock's **color falls −1**.

These moves happen on **every** purchase and **every** sale, including sales made through action cards or goal rewards. Buying or selling a **Wild Share** moves no price (it is colorless). A basic stock from the Starter Deck behaves identically to a blank stock of the same color from the Market Deck — same price track, no special ability.

---

## Setup

1. **Build the market deck:** Shuffle all 36 stock cards and 17 action cards into one **53-card** face-down market deck.
2. **Reveal the market:** Turn up **5 cards** from the market deck side by side.
3. **Build the event deck & reveal starting goals:**
   a. Shuffle all **30 event deck cards** (16 market-movement + 14 goal) together.
   b. Flip cards face-up, one at a time, until **4 goal cards** have come up *(placeholder — may scale with player count later, see `v5_tuning_notes.md`)*. Place those 4 goal cards face-up in the **goal row** — these are the starting public goals.
   c. Gather every other card — the market-movement cards you just flipped through, plus anything still face-down — into a single pile and reshuffle it. This reshuffled pile is **the event deck** for the rest of the game.
4. **Build the starter deck:** Shuffle the 24 starter deck cards (12 basic stocks + 12 starter actions).
5. **Deal starting hands:**
   a. Count out **2 cards per player** face-down from the event deck, and **2 cards per player** face-down from the starter deck (e.g. 4 players → 8 + 8 = 16 cards).
   b. Combine those two piles into one deck and **shuffle it together** — the split per player is *not* guaranteed to be 2-and-2; a player's hand could end up all starter cards, all event cards, or any mix.
   c. Any starter deck cards left over (not drawn into this pile) are **permanently removed from the game**.
   d. Deal the combined deck out completely, face-down: every player receives **4 cards**.
6. **Draft down to a hand of 3:**
   a. Each player looks at their 4 cards, **keeps 1**, and passes the other 3 face-down to the player on their left.
   b. Each player looks at the 3-card hand just received, **keeps 1**, and passes the remaining 2 to their left.
   c. Each player looks at the 2-card hand just received, **keeps 1**, and **discards the last card face-down** (removed from the game).
   d. Every player now holds a hand of exactly **3 cards** — any mix of starter stocks, starter actions, event market-movement cards, and/or private goal cards.
7. **Bank:** Give each player **$25**.
8. **Prices:** Set all four stock prices to **$4**.
9. **Loans:** Place the loan cards face-up within reach of all players (max **2 loans per player**).
10. **Progress tracker:** Set to **0**. The game-end threshold is currently **4 × players** *(placeholder — see Progress Tracker & Game End)*.
11. **First player:** Choose randomly. Play proceeds clockwise.

**Players start with $25, a drafted 3-card hand (contents vary by luck of the draft), and zero additional stocks beyond whatever ended up in that hand.**

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
1. Choose one stock card from your hand (a Wild Share cannot be sold). This can be a stock won at auction or a basic stock from your starting hand — they behave identically.
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
- If you're holding a market-movement card (from your starting draft, or drawn later via Insider Source), you may play it at any time as a free action. It resolves exactly like one drawn from the event deck, and **bumps the progress tracker by 1**, same as any other market-movement resolution.

### Claim a Goal
- See Goals below. Claiming a goal — public or private — is **optional and free** and never costs your turn.

### Take a Loan
- Loans are issued automatically when you cannot cover a payment (see Loans). You never choose to take one.

---

## Goals

Goal cards can enter play two different ways, and behave differently depending on which:

### Public Goals (the goal row)
- Revealed face-up on the table — 4 to start (see Setup), with more potentially added over the game whenever a "draw event" die face turns up a goal card (see Dice).
- **Any player** who holds the required stocks may claim a public goal the moment they qualify.
- If a newly-revealed public goal could be claimed by more than one player at once, the card is set aside and **all** of them get the reward — it's simply impossible to place one card in front of two players. This is expected to be rare.
- The progress tracker still only goes up by **1** for that claim, even when two players both benefit from it.

### Private Goals (in a player's hand)
- A goal card that lands in a player's hand — via the initial draft, or via Insider Source — is **secret**. Only that player knows about it and only they can complete it.
- To claim it, reveal it face-up in front of you (proving you hold it) at the same moment you show you hold the required stocks, then take the reward immediately.
- If you never complete a private goal, nothing happens — it doesn't count for or against you at game end.

### Claiming (both kinds)
- **Claiming is always optional** — you're never forced to claim a goal the moment you qualify; you may wait.
- A **Wild Share** may stand in for one stock of any one color the goal requires.
- Take the reward shown on the goal immediately, and bump the progress tracker by **1**.
- **Your stocks stay in your hand** after claiming — except any Wild Share used, which is discarded.
- Each goal card can be claimed once (aside from the simultaneous-public-claim exception above).

**Goal tiers** (unchanged from V4):
- **Pair** (4 cards): own 2 of one color.
- **Three of a Kind** (4 cards): own 3 of one color.
- **Two Pair** (6 cards): own 2 each of two colors.

---

## Action Cards (17)

These are shuffled into the **market deck** (unlike the Starter Action Cards above, which only live in the Starter Deck).

| Card | Effect |
|------|--------|
| **Tipster's Choice** | Draw 2 cards from the market deck, keep 1, return the other to the bottom. |
| **Liquidation** | Sell any number of stocks of a single color; gain **+$1 per stock sold** (each sale still moves that color's price −1 as usual). |
| **Corner the Market** | Take any one face-up market stock for free (not "bought" — no price move, no ability). |
| **Pump and Dump** | Sell 1 stock at **double** its current price. (Still a sale: that color falls −1.) |
| **The Squeeze** | Raise one stock +2, OR lower one stock −2. |
| **Wild Speculation** | Reveal the top market-deck card and put it on the bottom; if it is a colored stock, raise or lower that color by 3 (your choice). If it has no color, reveal again. |
| **Preferred Bidder** | **Persistent:** for the rest of the game, when you tie the high bid in an auction, you win the tie. |
| **Hostile Takeover** | Look at another player's hand and take 1 stock of your choice. They draw the top card of the market deck. |
| **Rumor Mill** | Adjust every stock by +1 or −1 (choose one direction for each stock). |
| **Insider Source** ×2 | Draw the top card of the **event deck** into your hand. If it's a market-movement card, play it later at any time as a free action (bumps the progress tracker when played). If it's a goal card, it's now a **private goal** only you can complete, exactly like one drafted at setup. *(Updated for V5's merged deck — the old "if only one tip remains" end-game clause is gone, since deck exhaustion no longer ends the game.)* |
| **Black Market** ×2 | ⚠️ **Needs a decision.** In V4 this triggered a side-auction for a tip drawn from a separate "unused tip pool" — that pool no longer exists in V5, since the whole event deck goes into circulation at setup. Needs a redefinition (e.g. auctioning off the actual top card of the live event deck?) before this card can be used. See `v5_tuning_notes.md`. |
| **Oil Broker** | New in V5. **Persistent:** once played, pay **$2 less** whenever you win an auction for an Oil (Orange) stock (minimum payment $0). Price still moves +1 and any special ability still triggers as normal — only the amount you pay changes. |
| **Rail Broker** | New in V5. **Persistent:** once played, pay **$2 less** whenever you win an auction for a Rail (Green) stock (minimum payment $0). |
| **Steel Broker** | New in V5. **Persistent:** once played, pay **$2 less** whenever you win an auction for a Steel (Blue) stock (minimum payment $0). |
| **Bank Broker** | New in V5. **Persistent:** once played, pay **$2 less** whenever you win an auction for a Bank (Purple) stock (minimum payment $0). |

Names for the 4 new Broker cards are drafts — open to change.

---

## Event Deck

The 30-card merged deck of market-movement and goal cards. It sits face-down; cards leave it only when drawn — by a dice "draw" face, or by **Insider Source**. It is **never reshuffled**.

- **Market-movement cards** (16): 8 Crash ("[Color] halved, round down," 2 per color), 4 Surge ("[Color] +4," 1 per color), 4 Slump ("[Color] −2 / [Color] −2" to two colors — currently only 4 of the 6 possible color pairs are represented, see `v5_tuning_notes.md`).
- **Goal cards** (14): see Goals above.

When a card is drawn from this deck (by dice or Insider Source):
- **Market-movement card:** resolve its effect immediately, then remove it from the game. Bumps the progress tracker by 1.
- **Goal card:** place it face-up in the public goal row (does **not** bump the tracker on its own — only claiming it later does), *unless* it was drawn by Insider Source, in which case it goes privately into that player's hand instead.

Special powers **Scout** and **Informant** let players peek at the top of this deck without removing anything from it.

---

## Dice — The Bag of Six

V5 replaces the single d6 with a **bag of 6 dice**. At the end of your turn, draw one die at random from the bag, roll it, and resolve its face. Set that die aside once used — don't return it to the bag. Once all 6 dice have been drawn (over the course of 6 turns), refill the bag with all 6 and keep going. Every 6 turns, each die is rolled exactly once — but you never know what order they'll come in.

| Die | Faces (6 total) |
|---|---|
| Bull-heavy A ×2 | Bull, Bull, Bear, Nothing, Nothing, Nothing |
| Bull-heavy B ×2 | Bull, Bull, Nothing, Nothing, Nothing, Nothing |
| Mixed-draw C ×1 | Nothing, Nothing, Nothing, Draw 1, Draw 2, Draw 3 |
| Draw-heavy D ×1 | Draw 1, Draw 1, Draw 1, Draw 2, Draw 2, Draw 2 |

**Face effects:**
- **Nothing:** no effect.
- **Bull Market:** all four stock prices rise **+1**.
- **Bear Market:** all four stock prices fall **−1** (floor $0).
- **Draw 1 / Draw 2 / Draw 3 Event(s):** draw that many cards from the top of the event deck, one at a time, fully resolving each (see Event Deck above) before revealing the next. Order matters — e.g. a Crash and a same-color Surge drawn together resolve in the order they came up.

If resolving a multi-card draw pushes the progress tracker past its threshold partway through, **finish resolving every card drawn** before the game ends. If the event deck ever runs out mid-draw (expected to be essentially impossible given its size), simply resolve whatever cards remain — nothing else happens, and the game is unaffected.

---

## Progress Tracker & Game End

A shared tracker starts at **0** and increases by:
- **+1** for every market-movement card resolved — whether played from a hand as a free action, or drawn via a dice face.
- **+1** for every goal completed — public or private, including a simultaneous public double-claim (still only +1 total for that one claim).

**The game ends the instant the tracker reaches its threshold** — the only end condition in V5. Deck exhaustion and "only 2 goals remain" (V4's end conditions) no longer apply.

Threshold is currently a flat **4 × players** *(placeholder — likely to change after playtesting; see `v5_tuning_notes.md`)*:

| Players | Threshold (4 × players) |
|---------|--------------------------|
| 2 | 8 |
| 3 | 12 |
| 4 | 16 |
| 5 | 20 |
| 6 | 24 |

The current action/turn finishes resolving fully before the game is declared over — there are no partial resolutions and no final turns beyond that.

---

## Loans

You may **bid or spend more money than you currently hold.**

- The instant a payment exceeds your cash, you are **automatically issued loan cards**. Each loan card gives you **$10** immediately. Take as many $10 loans as needed to cover the payment — **up to a maximum of 2 loans per player.** You cannot bid or commit to a payment beyond `cash + (2 − loans held) × $10`.
- Loans are **never taken voluntarily** and **cannot be repaid**.
- **End-game cost:** your **1st** loan costs **−$12**, your **2nd** (and final) loan costs **−$14**. Two loans total = −$26. If you're holding an unplayed **Easy Credit** starter card (see Starter Action Cards), every loan you took instead costs a flat **−$10** each.

> **Changed in V5:** max loans dropped from 3 to 2, and the escalation is no longer a uniform +$1 per loan (V4: $12/$13/$14) — it's now $12 then $14.

---

## Determining the Winner

When the game ends, each player totals their wealth:

- **Cash** on hand, plus
- **Stock value:** each colored stock × its current price (Wild Shares are worth $0), plus
- **End-of-game goal bonuses** (e.g., a goal that pays out at game end), plus
- **Hidden end-game bonus cards** still in your hand from the Starter Deck (Nest Egg, Portfolio, Trophy Case, Clean Ledger, Easy Credit — see Starter Action Cards), minus
- **Loan penalty:** −$12 for a 1st loan, −$14 for a 2nd (max 2 loans per player) — or a flat −$10 per loan instead if you're holding an unplayed **Easy Credit** card.

**Highest total wealth wins.**

**Tiebreaker:** most stock cards held. If still tied, share the victory.

---

## Deck Reshuffle

If the **market deck** runs out, shuffle its discard pile to form a new market deck and continue. The **event deck is never reshuffled** — but since the whole 30-card deck is in circulation from the start (rather than a small curated subset like V4's Insider Tip deck), running it dry is expected to be essentially unreachable in a normal game. If it somehow happens, see Dice above.

---

## Quick Reference

**Your turn — pick ONE:**
1. Start an auction
2. Sell one stock

**Then draw & roll a die from the bag** (see Dice) — resolve its face, then it's the next player's turn.

**Any time, free:** play action cards, play a market-movement card from your hand, claim any goal (public or private) you qualify for.

**Prices move:** buy a stock → its color +1; sell a stock → its color −1. (Wild Shares move nothing.)

**Progress tracker:** +1 per market-movement card resolved, +1 per goal completed. **Game ends immediately** when it hits the threshold (placeholder: 4 × players).

**Starting conditions:** $25 cash, a drafted 3-card hand (mixed contents), 0 additional stocks; all prices $4; 5 market cards; 4 public goals to start; progress tracker at 0.

**Wealth = cash + (stocks × price) + end-game goal bonuses + hidden end-game bonus cards − loan penalty (1st loan −$12, 2nd −$14, or flat −$10 each with Easy Credit); max 2 loans per player.**
