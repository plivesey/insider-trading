# Game 11 Analysis (V4)

## Setup
- **Players**: Astor (goal_seeker), Carnegie (value_estimator), Getty (deal_hunter), Vanderbilt (manipulator)
- **Rules version**: V4 (prices on trade, 2 turn-actions, dice-flipped Insider Tips, no End-Game Tracker, game ends on tip-deck exhaustion OR only-one-goal-remaining)
- **Insider Tip deck size**: 7 (2 × 4 players − 1)
- **Goals in play at start**: 6 (players + 2)
- **Starting cash**: $30 each, one Hot Tip, 0 stocks
- **Model**: Haiku 4.5 for all player subagents
- **Length**: 24 turns. **Ended on**: goal condition (Vanderbilt's chain-claim of goal-76 then goal-71 in a single free-action window dropped active goals from 3 → 1).

**Note on the record**: This game was resumed mid-stream at T18; turns 1–17 were not logged in detail by the previous facilitator session. The T18–T24 narrative below is complete; earlier turns are reconstructed from peeks, claimed goals, the discard pile, and the standings at T17.

## Final Results

| Place | Player | Cash | Stocks | Stock Value | Loans | Goals | Total Wealth |
|-------|--------|------|--------|-------------|-------|-------|--------------|
| 🏆 1st | **Vanderbilt** | $4 | 1Y + 3P + 2O | $84 | 3 (−$36) | 3 | **$52** |
| 2nd | Carnegie | $22 | 1B (Tip-Off) | $7 | 0 | 1 | **$29** |
| 3rd | Astor | $4 | 1B (Scout) + 1P | $24 | 0 | 0 | **$28** |
| 4th | Getty | $5 | 1P (Informant) | $17 | 0 | 1 | **$22** |

**Final prices**: Blue $7, Orange $7, Yellow $19, Purple $17

**Goals claimed** (5 of 6):
- T12 — Carnegie goal-68 *3 Blue* → stole $3 from each other player
- T15 — Vanderbilt goal-66 *2 Yellow* → set Blue to $6
- T21 — Getty goal-67 *2 Purple* (Wild Share substitute) → peek top 2 Insider Tips
- T24 — Vanderbilt goal-76 *2 Orange + 2 Purple* → draw 3 keep 1
- T24 — Vanderbilt goal-71 *3 Purple* → adjust every stock +1 or −1
- Never claimed: goal-74 *2 Blue + 2 Purple* (adjust two stocks +3 / −3)

## How the Game Was Decided — The T24 Game-Winning Chain

At end of T23, the standings were nearly even: **Carnegie $30, Vanderbilt $30 (tied), Astor $28, Getty $21**. Vanderbilt had three loans (−$36) dragging him down, but he held the most stock value and a *pending* goal-76 claim he had deliberately deferred on T23 ("manipulator wants to time the end").

T24 opened on Vanderbilt's turn. In a single free-action window before he even took a turn action, he executed the winning combo:

1. **Claimed goal-76** (2 Orange + 2 Purple). Reward: draw 3 from main deck, keep 1.
2. **Drew Purple blank, Yellow Scout, Orange Boom** — and kept the Purple blank. That gave him 3 Purple in hand.
3. **Immediately claimed goal-71** (3 Purple). Reward: adjust every stock +1 or −1.
4. Chose **Blue −1, Orange +1, Yellow +1, Purple +1** — pumping every color he held and dropping Blue (which only Carnegie and Astor held).

Active goals went 3 → 2 → 1 on a single turn, ending the game per the V4 end condition.

The reward stacking was brutal:
- His five colored stocks (1Y + 2P + 2O) became 1Y + 3P + 2O at adjusted prices: $19 + 3×$17 + 2×$7 = **$84 stock value**.
- Carnegie's only stock (Blue Tip-Off) dropped $8 → $7. Astor's Blue Scout did the same.
- **Final wealth: Vanderbilt $52 vs Carnegie $29 — a +$23 swing** in one free-action window.

**The key error by the field**: nobody anticipated that Vanderbilt's deferred goal-76 was actually loaded with a draw-3 reward that could *pull* the second goal-claim into existence on the same turn. The community was bidding as if "Vanderbilt is 1 stock away from his second goal" — really he was a draw-and-pick away from his **second and third** goals, terminally.

## Key Decisions and Errors

### Vanderbilt's deferred claim on T23 (correct call, in hindsight)
On T23 after winning his 2nd Orange, Vanderbilt had goal-76 ready but **declined to claim**, reasoning he didn't want to trigger end-game while in 3rd ($24). The all-stocks +1 die roll that ended T23 lifted him to tied-lead ($30), at which point claiming was clearly correct. He pulled the trigger on T24. A claim on T23 would have given him only $30+reward instead of $52 — the +1 to every stock had a much bigger impact on his 5-stock hand than on anyone else's, and waiting compounded that.

### Carnegie's T22 Purple auction (mispriced opening)
Carnegie opened the only Purple in market at *sticker* ($14), conceding all the price-discovery upside to opponents. Vanderbilt grabbed it at $17 (taking his 3rd loan), which set up the goal-76 path. Carnegie also passed at $17 even though blocking Vanderbilt was directly her interest as wealth-leader. A lower opening ($6–$8) plus a willingness to bid $18–$20 to block would have plausibly denied Vanderbilt his game-winning Purple. The "value estimator" personality was too price-disciplined in a context where blocking value > raw stock value.

### Carnegie misread her own Blue holdings
On T22, Carnegie's reasoning included "I have 2 Blues (Tip-Off + Blue)" when in fact she held only the Blue Tip-Off. The misread made goal-74 look reachable when it was further away, which fed her decision to chase Purple at sticker instead of building Blue depth from the cheap stock-3 Blue in market. The facilitator caught this and corrected on T22 — but the strategic implication carried.

### Astor's costly Wild Share auction-and-lose (T21)
Astor opened the Wild Share at $3 to win it for goal-67, but couldn't escalate past $13 without 2 loans. Getty stole it at $14. Astor finished 0 goals — the only player without one — and last in goals despite a goal_seeker personality. The Wild Share was her one realistic shot at scoring; she should have either opened higher to scare bidders away (e.g., $10 with the intent to commit a loan if needed) or taken the 2 loans to win the auction outright. Her $4 cash was the binding constraint all game.

### Getty's perfectly-timed sell-then-peek on T19
Getty sold her Orange Informant for $17 just before its Informant ability peeked **itip-51 (Orange halved)** — and then on the next turn (still T19, the same dice roll) the die rolled 1 and that exact tip resolved. Orange crashed from $16 → $8. Pure luck on the timing (Getty didn't know the die would roll 1), but the Informant peek gave her a free piece of post-fact validation: she knew the Orange holders had been hit, and she'd dodged. Vanderbilt's T20 Orange buy got annihilated by the *next* die-1 (itip-50, also Orange halved) — two Orange halves back to back, brutal for Vanderbilt's Orange exposure.

## Insider Tip Peeks — Who Looked, What They Saw, Whether They Acted

Every peek at the Insider Tip deck and whether the peeker then acted on it.

| Turn | Player | Peek source | Tip seen | Acted on it? |
|------|--------|-------------|----------|--------------|
| T1 | Astor | Hot Tip | itip-57 Orange +4 surge | Implied — Astor's early Orange-stock plays consistent with knowing the surge was coming. |
| T1 | Carnegie | Hot Tip | itip-57 Orange +4 surge | No specific action recorded; shared info with the table effectively (all 4 players burned their Hot Tip on T1 seeing the same card — see "Coordination failure" below). |
| T1 | Getty | Hot Tip | itip-57 Orange +4 surge | Same as Carnegie. |
| T1 | Vanderbilt | Hot Tip | itip-57 Orange +4 surge | Yes — fed directly into the T2 Wiretap below. |
| T2 | Astor | Scout (Blue, stock-7 bought) | itip-58 Yellow +4 surge (now top after Vanderbilt's reorder) | Possibly — Astor's early-game purchases moved toward Yellow exposure. |
| T2 | Vanderbilt | **Wiretap (action-47)** | itip-57 Orange +4, itip-58 Yellow +4 → reordered to put **Yellow on top** | Yes — the reorder directly created the T4 itip-58 resolution that surged Yellow first. Vanderbilt was already going to hold Yellow, so putting Yellow before Orange in the deck made the surge land on his color first. This was the highest-impact single peek of the game. |
| T19 | Getty | Informant (Orange, stock-16 sold) | itip-51 Orange halved crash | Vacuous — Getty had *just* sold her Orange so the peek confirmed what was about to happen rather than driving an action. Lucky that the die then rolled 1 and crashed it onto Vanderbilt's later-T20 buy. |
| T21 | Getty | **Goal-67 reward** (peek 2 tips) | itip-63 Yellow-2/Blue-2 slump, itip-49 Blue halved | Indirectly — Getty's subsequent passes on Blue and Yellow auctions (and bait-auctioning Orange to Vanderbilt) were informed by knowing both top tips were Blue/Yellow killers. She held no Blue or Yellow so this was largely confirmation that nothing in her own hand was at risk. |

**Unused peeks**:
- No Hot Tips remained at game end — all four players spent on T1 (see below).
- Inside Track and Wiretap (the two reorder action cards) — Wiretap was used T2 by Vanderbilt. Inside Track was sitting in the main deck at the end and was never drawn into a player's hand to be played.
- Yellow Informant (stock-24), Blue Informant (stock-8), Purple Scout (stock-31), Orange Scout (stock-15) — all in the main deck at the end, never bought. Their peeks never triggered.
- Vanderbilt held the **goal-76 claim** unclaimed from T23 → T24, which contains a draw-not-peek — but the draw-3 effectively gave him the equivalent of a triple peek into the deck *and* a free card.

### Coordination failure: all four Hot Tips burned on T1, same card
Every player saw **itip-57 Orange +4** on T1 via their Hot Tip. This is the worst possible outcome from a hidden-information design standpoint: every player gets the same intel, so no one has an asymmetric edge — the peek is essentially wasted. Vanderbilt extracted *additional* value by following up with Wiretap (which let him also see itip-58 and reorder), but the other three got pure noise from their T1 peek. **Design question for V4**: should Hot Tips be staggered, restricted, or made differently random per player? Right now the all-on-T1 strategy is dominant and degenerate.

## Purchase Chart

Per-player auction wins. T1–T17 records are partial (the resumed-mid-stream caveat); the T18–T24 detail is complete from the log.

### Astor's Purchases

| Card | Price | Outcome |
|------|-------|---------|
| Blue Scout (stock-7) | unknown (T2) | In hand at end, value $7 — was sold/used Hot Tip's twin peek on stock-7 buy revealed itip-58 |
| Purple blank (stock-28) | unknown | In hand at end, value $17 |

**Summary**: Astor's recorded auction wins net roughly $24 of stock at game-end prices. With only $4 cash and 0 goals, Astor's auction P&L is unknown for the early game but the standings show she didn't accumulate cash or stock depth.

### Carnegie's Purchases

| Card | Price | Outcome |
|------|-------|---------|
| Blue Tip-Off (stock-6) | unknown | In hand at end, value $7 |
| (other Blues used for goal-68) | unknown | Carnegie claimed 3-Blue goal on T12, so held ≥3 Blues at that point. By game end she had only 1 Blue (Tip-Off) — two Blues likely sold mid-game. Blue Boom (stock-5) is in discard pile, consistent with Carnegie selling it. |

T18–T24 attempts (no wins):
- T20: bid up to $6 on Orange blank (stock-11), passed at $8 → Vanderbilt won at $10.
- T22: opened Purple blank (stock-27) at $14, passed at $17 → Vanderbilt won at $17.
- T23: passed on Orange blank (stock-10).

**Summary**: Carnegie ended with $22 cash but only $7 stock value. Her goal-68 reward (steal $3 from each of 3 players = +$9) was her single biggest source of value. Her T18–T24 auction discipline preserved cash but also failed to advance her any goals — she had 0 Purple at game end despite all remaining goals requiring it.

### Getty's Purchases

| Card | Price | Outcome |
|------|-------|---------|
| Purple Informant (stock-32) | unknown | In hand at end, value $17 |
| Orange Informant (stock-16) | $9 (T18) | Sold T19 for $17 (net +$8); peeked itip-51 (Orange halved) on sale |
| Wild Share (stock-36) | $14 (T21) | Used T21 to claim goal-67 (reward: peek top 2 tips); discarded |

**Summary**: T18–T24 auction wins: $23 spent, $17 cash recovered (from selling Orange Informant), 1 goal claimed with peek reward. Net auction P&L of about −$6 cash but +1 goal + significant info edge. Getty was tied with Vanderbilt at $33 wealth after the Orange Informant flip — by far her highest point. The $14 Wild Share spend dropped her wealth back to $19 in pursuit of goal-67, then to $5 cash at game end. She got the goal but the cost was severe.

### Vanderbilt's Purchases

| Card | Price | Outcome |
|------|-------|---------|
| Yellow blank (stock-20) | unknown (pre-T15) | In hand at end, value $19. Used to claim goal-66 (2 Yellow, T15, reward set Blue to $6) |
| Purple blank (stock-25) | unknown | In hand at end, value $17. Used to claim goal-76 and goal-71 (T24) |
| Orange blank (stock-11) | $10 (T20) | In hand at end, value $7. *Bought right before two consecutive Orange-halve tips — paid $10 for what immediately became a $4 stock.* Eventually used to claim goal-76 (T24). |
| Purple blank (stock-27) | $17 (T22) | In hand at end, value $17. Took 3rd loan to pay. Used to claim goal-76 + goal-71 (T24) |
| Orange blank (stock-10) | $5 (T23) | In hand at end, value $7. Used to claim goal-76 (T24) |
| Purple blank (stock-26) | $0 (drawn T24 via goal-76 reward) | In hand at end, value $17. Completed 3 Purple → claimed goal-71 → won game |

**Summary**: T20–T23 auction spend ≈ $32 across three colored stocks (plus the free stock-26 draw on T24). Net cash hit was $22 (after the loans), but the strategy converted every stock into **multi-goal claims**: 2 Yellow (goal-66), then 2 Orange + 2 Purple (goal-76), then 3 Purple (goal-71). Three goal claims in one game, all the goal rewards extracted, plus a free draw-3-keep-1 that yielded the very Purple that finished the game. Even with 3 loans bleeding −$36, his stock value of $84 carried him to $52 — **24 points clear** of 2nd place.

## Takeaways

1. **Vanderbilt's chain-claim is a game-balance flag.** The draw-3-keep-1 reward on goal-76 *creating* the exact stock needed to claim goal-71 on the same turn is dramatic and decisive. The reward chained two end-condition contributions into one player action. Future games should track whether goal-reward-feeds-goal-claim patterns recur — if so, the rewards may need to forbid same-turn chaining (e.g., "you may not claim another goal this turn after taking this reward").

2. **The deferred-claim option is more powerful than the personality docs imply.** Vanderbilt's T23 hold-the-claim decision was the difference between $30 and $52. Goal claiming is "free and any time" — that includes deferring through a die roll that lifts every stock you hold. Players should be coached more explicitly that the claim window stays open as long as the game does.

3. **Hot Tip on T1 is a coordination trap.** All four players burning their peek on the same first card produced zero asymmetric info. Worth considering: a private setup peek, or starting tip-deck variance so that the top card isn't already public knowledge by T1.

4. **Carnegie's value-estimator personality was too passive in blocking spots.** Opening at sticker, passing on shallow blocks — both safe in isolation, both fatal when the leader is a competitor with 4 stocks in 3 colors. A "value estimator" should recognize when *denial of value to others* is positive expected wealth.

5. **Astor's goal_seeker hit the cash floor.** Starting $30 → ending $4 with no goals shows the goal-seeker had no path to convert intent into action. The Wild Share auction was lost by exactly $1 of loan-discipline. Possibly the goal_seeker personality should explicitly authorize taking 2 loans when the math is a goal claim vs. zero.

6. **3 of 7 Insider Tips never resolved.** The deck-empty condition was nowhere close — only 4 tips flipped (T4, T7, T19, T20). The goal condition is the live end-trigger in 4-player V4. The tip-deck size of 7 may be loose for 4P; consider players + 2 = 6 here as well, or accept that the tip clock is mostly atmospheric in larger games.
