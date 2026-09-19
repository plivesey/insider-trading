# V5 Open Tuning Questions & Ideas

Running list of things we've deliberately deferred while designing the next
version (V5) — decided "good enough for now, needs playtesting" rather than
settled. Check back here before/while playtesting; move an item into
`rules.md` once it's settled and delete it from here.

## 1. Initial goal-reveal count at setup

Setup reveals goal cards face-up from the shuffled event deck until **4**
are found. For now this is a flat 4 regardless of player count. The old V4
ruleset scaled goals-in-play with player count (`players + 3`). Worth
testing whether a flat 4 works across 2–6 players or whether it should
scale similarly (e.g. more goals revealed at setup for more players).

## 2. Progress tracker end-game threshold

Currently **3 × players + 2** (8 / 11 / 14 / 17 / 20 for 2–6 players),
changed from a flat **4 × players** (8 / 12 / 16 / 20 / 24) after
playtesting found games running too long, especially at higher player
counts. Needs more playtesting to confirm 3×+2 is the right slope/offset;
still just a placeholder.

## 3. Merged event deck card counts — RESOLVED: expanded to 47 cards

The original merge carried over V4's 16 market-movement cards (8 crash / 4
surge / 4 slump) + 14 goal cards (4 pair / 4 three-of-a-kind / 6 two-pair)
unchanged, into one 30-card deck. This turned out too small once the
Alternate variant deals straight from the event deck at setup (see item 13):
a 4-player Alternate game was leaving only ~10 cards in circulation for the
rest of the game. Expanded (2026-09-19) to 47 cards total:
- **Market-movement, 28** (was 16): 12 crash (was 8, +1/color), 4 surge
  (unchanged), 6 slump (was 4, now covers all 6 color pairs — resolves item
  4 below), 6 shift (new type: one color +2, the other -2, all 6 pairs).
- **Goals, 19** (was 14): the original 14 unchanged, + 4 Four of a Kind
  (very_hard, own 4 of one color, $12 reward) + 1 Full Spread (medium, own 1
  of each color, $6 reward).

Also added: the `GoalCard.difficulty` field now includes `'medium'` and
`'very_hard'` (was just `'easy' | 'hard'`) to label the two new goal tiers.

Caveat found while balancing this: adding more Crash (bearish) with no
added Surge (bullish, deliberately not added) means Slump+Shift can no
longer offset Surge to net exactly $0 per color like the original 16-card
deck did. The math only allows 2 of the 4 colors to land back at net $0;
Green and Purple absorb the rest, netting **-4** each (see
`tests/insider_tip_cards.test.js`'s balance test for the exact numbers).
Partially offset by item 15 below (one dice face changed from Nothing to
Bull). Worth revisiting if playtesting shows Green/Purple feeling
noticeably worse to hold than Blue/Orange.

## 4. Slump-card color-pair asymmetry — RESOLVED

Slump now covers all 6 possible color pairs (was 4 of 6, missing the two
"diagonal" pairs Blue-Purple and Orange-Green) — see item 3.

## 5. Informant naming

Informant's ability just changed from "peek 1 on sell" to "peek top 2 on
buy" — its trigger condition is now the same as Scout's (both trigger on
buy), and the name no longer references selling. Purely cosmetic/flavor;
consider a rename once the new specials are finalized.

## 6. Event deck exhaustion is now a non-event

Deck exhaustion and "only 2 goals remain" are no longer game-end
conditions — the progress tracker hitting its threshold is the only end
trigger now. Because the full ~30-card merged deck stays in play (rather
than a small curated subset like the old Insider Tip deck), running the
deck dry is expected to be essentially unreachable in practice. If it
somehow does happen mid a multi-card draw, no special handling: just
resolve whatever cards remain and nothing else happens.

## 7. Black Market action card — RESOLVED: removed

Black Market's V4 mechanic ("auction a face-down Insider Tip from the
unused-tip pool") had no analog in V5, since the whole event deck goes
into circulation at setup with no leftover pool. Decided: the card is
removed entirely rather than redefined. At the time, this made the Market
Deck 36 stock + 15 action = 51 cards (11 V4 actions carried over + 4 new
Broker cards); both the Market Deck and event deck sizes have since changed
again (Market Deck now 47 for Classic after further action-card cuts; event
deck now 47 after item 3's expansion) — see `rules.md`'s Components section
for current numbers.
`rules.md`, `cards/action_cards.json`, and the online migration plan
(`online/V5_MIGRATION_PLAN.md`) all reflect this.

## 8. Insider Source now might draw a goal card

Since Insider Source draws from the merged event deck, it can now surface
either a market-movement card (as before) or a goal card. `rules.md`
currently treats a drawn goal card as becoming a private goal for that
player, same as one drafted at setup — this is an inferred extension, not
something you explicitly specified, so double-check it's what you want.

## 9. Color-blindness risk: Orange vs. Green

Swapping V4's Yellow for **Green** (Rail) means the four stock colors are
now Blue, Orange, Green, Purple. **Orange and Green are a known problem
pair for red-green color blindness** (deuteranopia/protanopia, ~8% of
men) — both can shift toward a similar brownish/olive hue, which is a
common accessibility complaint in board games that put those two colors
next to each other. Blue and Purple can also be mixed up by some
colorblind viewers, though it's usually a milder issue than Orange/Green.

The game already has a built-in mitigation: each color's cards carry a
distinct **thematic icon** (`icon-oil.png`, `icon-rail.png`,
`icon-steel.png`, `icon-bank.png` in `cards/assets/`), so as long as
every physical card and the price board show the icon alongside the
color swatch (not color alone), colorblind players have a non-color way
to tell stocks apart. Worth double-checking that convention holds
everywhere before finalizing card art — the price board in particular
should show icons, not just colored bars. Consider running a colorblind
simulator over the final card/board art before printing.

## 10. Broker card names are drafts

Oil Broker / Rail Broker / Steel Broker / Bank Broker (the new $2-auction-
discount persistent cards) are placeholder names — open to change once
finalized.

## 11. Private market-movement cards can stall the progress tracker

A privately-held market-movement card only ever gets played if its holder
wants to (playing cards is "any time," never mandatory). A rational player
holding a card that's currently harmful to their own portfolio (e.g. a
crash on a color they're heavily invested in) has no incentive to ever play
it. Discovered via bot self-play at 6 players (where more event-deck cards
get siphoned into the initial draft and end up privately held): it's
possible for every remaining path to +1 progress to be simultaneously
unappealing to whoever holds it, so the progress tracker can sit forever a
few points short of threshold with no way to force a resolution.

The online implementation works around this for bots with a heuristic
fallback (a bot eventually force-plays its least-bad held card after ~400
turns of no tracker movement — see `online/backend/src/bots/decide.ts`),
but that's a bot-AI patch, not a rules fix. Worth deciding whether the
physical rules want an explicit tie-breaker for this case (e.g. "a player
holding a market-movement card must play it before their Nth turn," or a
house rule that the game ends in a stalemate scored as-is after some fixed
number of turns) — not urgent since it seems to require an unlucky
combination of hands, but real enough that it showed up in automated
testing.

## 12. Starter-draft card value ledger & balance pass

Ran a 9,921-game all-bot simulation correlating each player's *drafted*
starting 3-card hand with final placement, broken out per individual card
(not just category) — [The Setup Draft Ledger](https://claude.ai/code/artifact/3b5a775c-c66a-4a9a-8e92-2b64ab60166a).
Headline pattern: **Basic Starter Stocks > Starter Action Cards ≈ Hidden
Bonus Cards ≈ Insider Tip Cards > Goal Cards**, fairly consistently — a
plain stock in hand is unconditional, sellable value from the moment the
draft ends, while a goal only pays off if you actually complete it before
the (now shorter, see item 2) game ends.

Caveat: this reflects value *given how the bots currently draft and play*
— bots actively choose what to keep, so a card's measured value partly
reflects the bots' own (heuristic-only) sense of what's good, not
necessarily the card's true power at a human table.

First balance changes made off this data (2026-09-15), aimed at
strengthening the weakest action cards:
- **Market Panic**: every other player loses $4 (was $3).
- **Double Down**: no longer costs $2 to play — just resolve another
  single-use action card in hand twice, for free.

Worth re-running the simulation after these land to see whether they moved
the needle, and considering similar targeted buffs for the other
consistently-weak actions (Foresight, Double Down were the two lowest
before this change) and goal cards generally.

## 13. Alternate setup variant

A second selectable setup variant, "Alternate," now exists alongside the
Classic rules described throughout `rules.md` (see its "Alternate Setup
Variant" section for the full spec). Summary: an 8-card basic-stock-only
starter deck (1 dealt per player, no draft), a 4-card event-deck-only
initial draft (still ending in a 3-card drafted hand, +1 dealt stock = 4
cards to start), Foresight/Backroom Deal/Double Down promoted from starter
actions into the Market Deck (14 action cards total, no hidden bonus cards),
and a flat 4×players progress threshold instead of Classic's 3×+2.

This was also, incidentally, a partial reversion of item 2 above (4×players
was the pre-3×+2 default) — but only for Alternate; Classic's threshold is
unchanged. The threshold tuning in item 2, the deck-composition numbers in
item 7 (now 36+11=47 for Classic, not 51), and the starter-draft value
ledger in item 12 are all Classic-only observations — none of them have been
re-run or re-validated for Alternate yet. Worth doing so once Alternate gets
some real playtesting.

## 14. Total card exhaustion can deadlock a marathon game (found via Alternate bot testing)

While stress-testing Alternate with very long (tens-of-thousands-of-ticks)
bot-vs-bot games, one seed (6 players, seed 1234) hit a state where the
market, the main deck, AND the discard pile were all simultaneously empty —
every physical Market Deck card had ended up permanently held in a player's
hand (mostly via goal completions, where "your stocks stay in your hand"
per rules.md). With market empty, no auction is possible; with nothing
sellable either, decideTurnAction correctly has no legal move, and the game
deadlocks (an actual `it.each` test hits this, not just a slow game —
raising the tick budget to 100,000 didn't resolve it).

This isn't a Corner-the-Market/Fire-Sale/etc. bug — those specific "no
eligible card" cases now fizzle gracefully (fixed alongside the Alternate
work, see `promptResponse.ts`'s `pick_market_card` handler and
`turn.ts`'s `drawTopOfDeck`, which also had a related refill-starvation bug:
cards returning to `mainDeck` via a reshuffle from a Hostile Takeover/First
Look draw weren't triggering `refillMarketIfNeeded`, so a starved market
could stay stuck at 0 even after mainDeck was replenished). This is instead
total, genuine exhaustion of the shared card pool — the rules.md "Deck
Reshuffle" section assumes this is "essentially unreachable in a normal
game," which is true for a normal ~20-turn game but not for the kind of
extreme marathon (tens of thousands of ticks) a bot stress-test can produce
when it also gets stuck in unproductive loops (see item 11's Hostile
Takeover-style back-and-forth). Needs an actual rules decision (e.g. does a
turn just pass with no action when this happens? does the game force-end?)
rather than an engine-only patch. The failing seed is currently just avoided
in the Alternate bot-game test suite rather than fixed.

## 15. Dice bag rebalanced: one more Bull face

To partially offset item 3's bearish-leaning Event Deck expansion (more
Crash, no added Surge), Mixed-draw die C's third "Nothing" face was changed
to "Bull" (`online/shared/src/dice.ts`). Chosen because C (along with
Draw-heavy D) was one of only two dice with zero existing Bull/Bear faces,
so the change is a light, contained nudge rather than amplifying an
already-Bull-heavy die (A/B). Not an exact numeric offset — just a rough
counterbalance; worth re-measuring average price drift over a full game
once there's been some playtesting.
