# Game 8 Analysis (V4)

## Setup
- **Players**: Astor (goal_seeker), Getty (deal_hunter), Morgan (goal_chaser)
- **Rules version**: V4 (no End Game Tracker; ends on Insider Tip deck empty OR only one goal left)
- **Starting cash**: $30 each, one Hot Tip, 0 stocks
- **Insider Tip deck**: 6 cards (2 x players)
- **Goals in play**: 5 (players + 2)
- **Model**: Haiku 4.5 for all player subagents
- **Mid-game rule change** (logged T16-17): auctioneer sets an initial price and a card is always sold; stock prices uncapped (floor $0, no max).

## Final Results

| Place | Player | Cash | Stocks | Stock Value | Loans | Goals | Total Wealth |
|-------|--------|------|--------|-------------|-------|-------|-------------|
| 1st | **Getty** | $9 | 2B + 2Y + 2O + 1P | $108 | 3 (−$36) | 1 | **$81** |
| 2nd | Astor | $25 | 2B + 1Y | $48 | 0 | 2 | **$73** |
| 3rd | Morgan | $4 | 1O + 2Y + 1P | $64 | 0 | 1 | **$68** |

**Final prices**: Blue $14, Orange $16, Yellow $20, Purple $8
**Length**: 42 turns. **Ended on**: goal condition (Getty claimed goal-73, the 4th of 5 goals, leaving only goal-70). The Insider Tip deck still had 1 card unused.

## Key Findings

### 1. The decisive goal, not the most goals, won the game
Astor claimed 2 goals (goal-67, goal-71) and lost. Getty claimed exactly 1 — but it was goal-73, the game-ENDING goal, claimed while he was ahead. Morgan (the goal_chaser) claimed 1 and finished last. Every player's personality prompt asserts "the player who claims the most goals consistently wins." **This game directly contradicts that.** What mattered was controlling *when* the game ends and being ahead at that instant.

### 2. Goals dropped to 2 by Turn 8 — then a 34-turn denial standoff
Three goals were claimed early (Astor T3 & T4, Morgan T8). From T8 onward only goal-73 (2B+2Y) and goal-70 (3Y) remained, meaning **the next goal claimed would end the game**. For 34 turns no one could safely complete a goal — a player only wants to claim the 4th goal if claiming wins them the game. This is the V4 analogue of the V3 tracker stalemate: the "only one goal left" end-condition creates a long pre-endgame where players race to deny each other rather than build.

### 3. "Deny the game-ending Yellow" auctions consistently ran ~2x market
Both goal-73 and goal-70 needed Yellow, so every Yellow that hit the market became a game-ending card and drew massive overbids:
- T30: Astor paid **$21 for a ~$10 Yellow** to deny Getty.
- T35: Morgan paid **$18 for a ~$15 Yellow** to deny Getty.
- T42: Getty paid **$20 for the Yellow Boom** (3 loans) — and this time it stuck.
The AIs reliably recognised the deny incentive and priced it.

### 4. Loans used correctly as a win-condition tool
Getty finished with 3 loans (−$36) and still won by $8. He took 2 loans on the final auction specifically to secure the game-winning Yellow Boom. The −$2 net cost per $10 loan is trivial against winning, and the deal_hunter agent reasoned this explicitly ("loans only cost −$2 net per $10").

### 5. Astor found the exact winning counter-line and lost by the math
On the final auction Astor correctly computed his maximum *winning* bid was $19 (claim goal-73, lower Getty's Orange → finish $74 vs $73). Getty simply had more headroom (he could profitably bid into the mid-$20s) and took it at $20. Astor's loss margin was a single dollar — the endgame arithmetic was tight and both Haiku agents handled it well.

### 6. Uncapped prices inflated the whole board
With the $10 cap removed mid-game and frequent rolls of 6 (all stocks +1 — it hit on T36, T37, T39, and several earlier turns), prices ran far above the V3 range: Yellow $20, Orange $16, Blue $14 at game end. Winner's wealth ($81) is nearly double the V3 games' $44-48.

### 7. The Insider Tip deck never ran out
5 of 6 tips resolved (rolls of 1 on T3, T13, T15, T25, T31). The game ended on the goal condition with 1 tip (a double-surge) still in the deck. Both V4 end conditions are live, but the goal condition fired first here.

## Turn-by-Turn Highlights
- **T1-T2**: Opening auctions; Astor wins Corner the Market.
- **T3**: Astor plays Corner the Market (free Purple) and claims goal-67 (2 Purple, easy). 4 goals left.
- **T4**: Astor buys a 3rd Purple, claims goal-71 (3 Purple, hard) — adjust-all reward. 3 goals left.
- **T8**: Morgan claims goal-72 (2B+2O) using a Wild Share as the 2nd Orange. **2 goals left — the long endgame begins.**
- **T9-T31**: Repositioning and denial. Astor sells Purples ahead of crashes he foresaw via Scout/Wiretap; Getty steals a Blue via Hostile Takeover (T28); Astor overpays $21 on T30 to deny Getty a Yellow.
- **T35**: Morgan overpays $18 on a Yellow to deny Getty's goal-73 win.
- **T39**: Getty wins an Orange Tip-Off; a Yellow Boom refills into the market.
- **T40-T41**: Morgan and Astor both decline to auction the Yellow Boom, delaying the inevitable.
- **T42**: Getty auctions the Yellow Boom, wins it at $20 over Astor's $19, claims goal-73 (raising Orange +3), and **wins the game $81-$73-$68.**

## Comparison to Previous Games

| Metric | Game 6 (V3) | Game 7 (V3) | Game 8 (V4) |
|--------|-------------|-------------|-------------|
| Players | 3 | 3 | 3 |
| Turns | 37 | 46 | 42 |
| Goals claimed | 5 | 3 | 4 of 5 |
| Winner's wealth | $48 | $44 | $81 |
| Winner's goals | 2 | 0 | 1 |
| Pre-endgame standoff | 7 turns | 7 turns | ~34 turns (2 goals in play) |
| Game-ender | crisis card | crisis via deck cycling | goal claim |

## Design Observations

1. **The "only one goal remains" trigger creates a very long pre-endgame.** Goals fell to 2 by T8 and stayed there 34 turns. Once the count is low, claiming becomes a game-ending act, so players stall and deny instead of building. Consider: end the game when **two** goals remain (3 players → end after 3 of 5 claimed), or scale the trigger, or add a turn cap.

2. **The personality prompts overstate the "most goals wins" heuristic.** Two of three agents are told goal-claiming is THE path to victory, yet the winner claimed the fewest goals (1) and a 2-goal player lost. The real lever is *timing the game's end while ahead*. The agent guidance could be revised to emphasise clock control over raw goal count.

3. **Uncapped prices + frequent "+1 all" rolls inflate scores fast.** Winner wealth jumped from ~$45 (V3) to $81. Not necessarily bad, but the roll-of-6 (all +1) disproportionately rewards whoever holds the most stock cards — Getty held 7 at the end. Worth checking whether the d6 distribution (1/6 chance of +1-all) is too generous.

4. **Denial auctions worked as designed.** Players consistently identified game-ending cards and bid ~2x market to deny them. The auction system produces tense, readable decisions — this is a strength.

5. **The endgame math was decided by single dollars and the AIs computed it accurately.** Astor's $19-vs-$20 near-miss shows the bid economy is finely balanced at the top end. Good sign for V4's tactical depth.
