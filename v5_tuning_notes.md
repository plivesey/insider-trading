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

Currently a flat **4 × players** (8 / 12 / 16 / 20 / 24 for 2–6 players).
May want non-linear scaling instead — floated as a rough example:
**10 / 13 / 16 / 19 / 22** for 2–6 players (i.e. roughly +3 per player
above 4p rather than +4). Needs actual playtesting to settle; the flat
4× formula is just a placeholder until we have data.

## 3. Merged event deck card counts

The new event deck merges the old 16 market-movement cards (8 crash / 4
surge / 4 slump) with the old 14 goal cards (4 pair / 4 three-of-a-kind /
6 two-pair) into one 30-card deck. These counts are carried over unchanged
from V4 as a starting point — we may want to adjust the mix (more/fewer of
a given type, or resize the deck) once we've played a few games with the
new merge-and-draft setup.

## 4. Slump-card color-pair asymmetry

Slump cards (-2/-2 to two colors) only cover 4 of the 6 possible color
pairs (a 4-color cycle: Blue-Orange, Orange-Purple, Purple-Green,
Green-Blue) — the two "diagonal" pairs (Blue-Purple, Orange-Green) have
no slump card. By contrast, the two-pair goal cards use all 6 combinations.
Not necessarily a problem, but worth deciding whether to add the missing 2
slump variants for symmetry, or leave it as an intentional asymmetry.

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
unused-tip pool") had no analog in V5, since the whole 30-card event deck
goes into circulation at setup with no leftover pool. Decided: the card is
removed entirely rather than redefined. Market Deck is now 36 stock + 15
action = 51 cards (11 V4 actions carried over + 4 new Broker cards).
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
