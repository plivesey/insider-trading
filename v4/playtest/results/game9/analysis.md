# Game 9 Analysis (V4)

## Setup
- **Players**: Astor (goal_seeker), Getty (deal_hunter), Morgan (goal_chaser)
- **Rules version**: V4 (no End Game Tracker; ends on Insider Tip deck empty OR only one goal left)
- **Starting cash**: $30 each, one Hot Tip, 0 stocks
- **Insider Tip deck**: 6 cards (2 x players)
- **Goals in play**: 5 (players + 2)
- **Model**: Haiku 4.5 for all player subagents
- **Length**: 25 turns. **Ended on**: Insider Tip deck exhausted (all 6 tips resolved). The two final goals were never claimed.

## Final Results

| Place | Player | Cash | Stocks | Stock Value | Loans | Goals | Total Wealth |
|-------|--------|------|--------|-------------|-------|-------|-------------|
| 1st | **Getty** | $15 | 4Y + 1B | $72 | 1 (−$12) | 1 | **$75** |
| 2nd | Morgan | $33 | 1P + 1B + 1 Wild | $14 | 0 | 2 | **$47** |
| 3rd | Astor | $22 | 2O | $16 | 0 | 0 | **$38** |

**Final prices**: Blue $4, Orange $8, Yellow $17, Purple $10
**Goals claimed**: 3 of 5 (Morgan goal-64 T3, Morgan goal-68 T6, Getty goal-70 T10). goal-76 and goal-69 were never claimed.

## Key Findings

### 1. The winner concentrated on one color and rode the Insider Tips
Getty went all-in on Yellow: 4 Yellow stocks worth $68 of his $75 final wealth. Yellow was surged twice by the event deck — itip-58 (Yellow +4) on T1 and itip-61 (Yellow +3) on T13 — and every Yellow Getty bought pumped the color another +1. Yellow climbed from $4 to $17. Concentration into a color that the tip deck favored, plus the matching goal-70 (3 Yellow), was the entire game. The deal_hunter's "buy the color you intend to pump" instinct paid off enormously.

### 2. "Most goals" again did NOT win — but it did separate 2nd from 3rd
Getty won with 1 goal. Morgan (goal_chaser) claimed 2 and finished 2nd; Astor (goal_seeker) claimed 0 and finished last. As in Game 8, the winner was not the goal leader. But unlike Game 8, goal count did track the lower placements (2 goals = 2nd, 0 goals = 3rd). The personality prompts still overstate "most goals wins" — the real driver was a large, appreciating stock position.

### 3. Goals fell to 2 by Turn 10, then a 15-turn no-claim standoff
Three goals were claimed early (Morgan T3 & T6, Getty T10). From T10 on, only goal-76 (2O+2P) and goal-69 (3O) remained — so claiming either would END THE GAME. Getty (Yellow-heavy) could never claim them; Astor and Morgan could get close but refused, because claiming would end the game while they trailed Getty. This is the same pre-endgame stall seen in Game 8 (there, 34 turns; here, 15) — once the goal count is low, claiming becomes a losing act for anyone not in the lead.

### 4. The Insider Tip clock, not a goal, ended the game
Unlike Game 8 (ended on a goal claim), here all 6 tips resolved and the deck emptied. Rolls of 1 hit on T1, T5, T13, T14, T23, T25 — and the 6th one ended it. Because the trailing players had no incentive to claim and Getty couldn't, the tip deck became the only live end-condition. **The d6 is therefore the de-facto game clock whenever the leader can't be caught** — the trailing players are just running out the rolls.

### 5. The "Wild Share trap" neutralised the goals
A Wild Share sat in the market for the last several turns. Astor (2 Orange + 1 Purple) could have won it and claimed a goal — but claiming ends the game, and Astor was last. So a goal-completing card became *unwanted* by the only player who could use it. The Wild Share substitution rule is powerful, but near the end it can sit dead because the end-game trigger makes claiming self-defeating.

### 6. Trailing players spent turns on action cards that scored $0
Astor won Preferred Bidder ($4) and Wild Speculation ($0) — and never got value from either. Wild Speculation was still unplayed at game end (worth $0). Preferred Bidder won exactly one $0 tie. Action cards have no end-game wealth, and in a game this short the trailing players effectively burned turns and cash on them. Morgan's Pump and Dump was the exception — see below.

### 7. Pump and Dump was the one high-value action play
Morgan used Pump and Dump on T22 to sell an Orange Informant at double ($20 for a $10 stock), a clean +$10 of raw wealth while behind. It moved Morgan from ~$40 to a clear 2nd. Converting a stock to double cash is strong precisely in the endgame when there is no time to grow a position.

### 8. Getty's loan discipline held
Getty took exactly 1 loan all game (T10, to win the Wild Share that completed goal-70 for +$10 — a clearly profitable loan) and then refused 2nd loans for Preferred Bidder and Wild Speculation, correctly judging them marginal. Getty also sold off Blue and his lone Orange late to stay liquid and dodge the known Blue crash. Disciplined, lead-protecting play.

## Turn-by-Turn Highlights
- **T1**: Astor auctions a Blue Boom; Morgan wins it $7. Roll of 1 → Yellow +4 (itip-58). Yellow's rise begins.
- **T3**: Morgan wins a Blue blank ($8) and claims goal-64 (2 Blue) for +$5. 4 goals left.
- **T5**: Getty wins a Yellow blank ($9). Roll of 1 → Black Monday, all −2.
- **T6**: Morgan wins Stock Certificate Forgery ($6) and immediately plays it to claim goal-68 (3 Blue, using only 2 Blue), stealing $4 from each opponent. 3 goals left.
- **T10**: Getty wins a Wild Share ($10, 1 loan) and claims goal-70 (3 Yellow, using 2 Yellow + Wild) for +$10. **2 goals left — the long stall begins.**
- **T13**: Roll of 1 → Yellow +3 / Purple +3 (itip-61). Getty's Yellow position balloons.
- **T14**: Morgan wins Wiretap. Roll of 1 → Blue halved (itip-48).
- **T18**: Getty wins an Orange blank ($4), denying Astor a 3rd Orange (which would have put Astor one stock from goal-69).
- **T21**: Astor wins Preferred Bidder ($4). Astor and Getty both burn Hot Tips. Morgan plays Wiretap, reordering the last 2 tips to crash Getty's Blue harder (surge-then-crash).
- **T22**: Morgan plays Pump and Dump on an Orange Informant — sells at double for $20. Astor activates Preferred Bidder.
- **T23**: Astor wins Wild Speculation ($0) — never plays it. Roll of 1 → Blue +4.
- **T25**: Getty sells his last Orange. Roll of 1 → Blue halved (itip-49). **Tip deck empty → game over. Getty wins $75 / $47 / $38.**

## Comparison to Previous Games

| Metric | Game 6 (V3) | Game 7 (V3) | Game 8 (V4) | Game 9 (V4) |
|--------|-------------|-------------|-------------|-------------|
| Players | 3 | 3 | 3 | 3 |
| Turns | 37 | 46 | 42 | 25 |
| Goals claimed | 5 | 3 | 4 of 5 | 3 of 5 |
| Winner's wealth | $48 | $44 | $81 | $75 |
| Winner's goals | 2 | 0 | 1 | 1 |
| Pre-endgame standoff | 7 turns | 7 turns | ~34 turns | ~15 turns |
| Game-ender | crisis card | crisis via deck cycling | goal claim | Insider Tip deck empty |

## Design Observations

1. **Both V4 end-conditions are confirmed live.** Game 8 ended on the goal trigger; Game 9 ended on the tip-deck trigger. Good — neither condition is dead weight. But note *why* Game 9 ran to the tip deck: nobody trailing wanted to claim. The tip deck is the safety net that stops the "only one goal left" stall from lasting forever.

2. **The low-goal-count stall reappears.** Goals hit 2 by T10 and no one claimed for 15 turns. The trailing players cannot afford to claim (it ends the game while they lose) and the leader often *can't* claim. Consider ending the game when **two** goals remain (3 players → after 3 of 5 claimed) so the stall can't form, or otherwise decoupling "claim a goal" from "end the game."

3. **Action cards are weak for trailing players in a short game.** Astor sank a turn and $4 into Preferred Bidder and got a $0 tie out of it; Wild Speculation never even got played. Action cards score $0 at game end, so in a 25-turn game they are only worth it if they convert to wealth fast (Pump and Dump did; the others didn't). The card pool may be fine, but the AIs over-value "optionality" cards when the clock is short.

4. **Concentration beats diversification when the tip deck cooperates.** Getty's 4-Yellow stack won because Yellow got two surge tips. That is partly luck — but the +1-on-buy rule means a player who commits to a color also *manufactures* its rise. This is a satisfying strategy to have available; worth watching whether it is too dominant across more games.

5. **Game length was half of Game 8.** 25 vs 42 turns, driven by six rolls of 1 landing relatively early and the lack of a goal-denial bidding war (no remaining goal needed a color that hit the market as a hot contested stock). Variance in game length is wide (25–46 across logged games); a turn cap or a steadier clock would tighten the experience.

6. **The Wild Share can go dead in the endgame.** Once claiming a goal is a losing move, a Wild Share — whose only use is completing a goal — becomes worthless to the very players who could use it. Minor, but it means a "powerful" card reads as a trap in the final turns.
