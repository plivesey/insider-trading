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
pairs (a 4-color cycle: Blue-Orange, Orange-Purple, Purple-Yellow,
Yellow-Blue) — the two "diagonal" pairs (Blue-Purple, Orange-Yellow) have
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

## 7. Black Market action card needs a rewrite (⚠️ blocks nothing else, but needs a decision)

Black Market currently reads (V4): "when revealed in the market, auction a
face-down Insider Tip from the unused-tip pool." That pool doesn't exist in
V5 — the whole 30-card event deck goes into circulation at setup instead of
a curated subset with leftovers set aside. Options to consider: auction the
actual top card of the live event deck (winner takes it as a private
market-movement card or goal, same as Insider Source); remove the card
from the game entirely and replace its slot with something else; or some
other mechanic. Needs your call before this card is usable again —
`rules.md` currently flags it inline with a placeholder.

## 8. Insider Source now might draw a goal card

Since Insider Source draws from the merged event deck, it can now surface
either a market-movement card (as before) or a goal card. `rules.md`
currently treats a drawn goal card as becoming a private goal for that
player, same as one drafted at setup — this is an inferred extension, not
something you explicitly specified, so double-check it's what you want.
