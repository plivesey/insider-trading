import type { HandCard } from '@insider-trading/shared';

/**
 * Static best-to-worst ranking for the setup pass-and-draft procedure,
 * replacing the old contextual `perceivedDraftCardValue` heuristic. Values
 * are the avg. finishing-position percentile (1.0 = always 1st, 0.0 =
 * always last) each specific card scored across a 9,921-game all-bot
 * simulation correlating drafted starting hands with final placement --
 * see v5_tuning_notes.md item 12 and the "Setup Draft Ledger" artifact
 * linked there.
 *
 * This is a deliberately dumb heuristic: always keep whichever draft
 * candidate ranks highest here, full stop, with no regard for the rest of
 * the bot's hand, table state, or player count. Known to be wrong in
 * plenty of specific situations -- it's meant only to be a better default
 * than the ad-hoc contextual scoring it replaced, per direct instruction.
 *
 * Caveat: Double Down and Market Panic were buffed (Double Down's $2 cost
 * removed; Market Panic's damage raised $3->$4) after this data was
 * collected, so their true rank is probably a bit higher than measured
 * here. Re-run the simulation and regenerate this table once there's been
 * more balance movement.
 */
const STATIC_DRAFT_CARD_VALUE: Record<string, number> = {
  'Starter Stock: Blue': 0.629,
  'Starter Stock: Green': 0.61,
  'Starter Stock: Orange': 0.606,
  'Starter Stock: Purple': 0.6,
  'First Look': 0.568,
  'Fire Sale': 0.554,
  'Backroom Deal': 0.543,
  Windfall: 0.508,
  'Nest Egg': 0.497,
  'Purple +4': 0.494,
  'Blue +4': 0.475,
  'Green +4': 0.472,
  'Clean Ledger': 0.469,
  'Orange +4': 0.469,
  Portfolio: 0.464,
  'Easy Credit': 0.463,
  'Market Panic': 0.462,
  'Trophy Case': 0.461,
  'Purple -2 / Green -2': 0.458,
  'Blue stock value is halved (round down)': 0.457,
  'Blue -2 / Orange -2': 0.457,
  'Green stock value is halved (round down)': 0.454,
  'Green -2 / Blue -2': 0.452,
  'Purple stock value is halved (round down)': 0.45,
  'Orange -2 / Purple -2': 0.45,
  'Branch Line': 0.446,
  'Foundry Stake': 0.443,
  'Steel Trust': 0.439,
  'Rail Monopoly': 0.438,
  Foresight: 0.435,
  'Double Down': 0.433,
  'Orange stock value is halved (round down)': 0.431,
  'Wildcat Wells': 0.425,
  'Crude & Credit': 0.423,
  'Oil Baron': 0.421,
  'Money Trust': 0.42,
  'Heavy Industry': 0.417,
  'Industrial Capital': 0.413,
  'Fuel & Freight': 0.412,
  'Track & Trust': 0.409,
  'Counting House': 0.405,
  'Vertical Integration': 0.397,

  // --- Provisional estimates below: added after the 9,921-game simulation
  // that produced the values above, so these are hand-picked (by analogy to
  // similar existing cards), not measured. Re-run the simulation and replace
  // with real data once possible.
  // Slump's 2 new pairs (same -2/-2 shape as the existing 4 slump entries).
  'Blue -2 / Purple -2': 0.454,
  'Orange -2 / Green -2': 0.454,
  // New Shift type (+2 one color / -2 another) -- no historical data at all;
  // placed between Slump (~0.45) and Surge (~0.47-0.49) since it's a mixed
  // up/down effect like Slump but with a partial upside like Surge.
  'Blue +2 / Orange -2': 0.46,
  'Orange +2 / Green -2': 0.46,
  'Green +2 / Purple -2': 0.46,
  'Purple +2 / Blue -2': 0.46,
  'Blue +2 / Green -2': 0.46,
  'Orange +2 / Purple -2': 0.46,
  // Four of a Kind (very_hard, $12 reward) -- placed near the low end of the
  // existing Goal range: bigger payout than Two Pair/Three of a Kind, but a
  // harder single-color requirement likely completes less often in practice.
  'Steel Empire': 0.4,
  'Oil Empire': 0.4,
  'Rail Empire': 0.4,
  'Banking Empire': 0.4,
  // Full Spread (medium, $6 reward) -- 1 of each color often happens
  // opportunistically through normal varied auctions, so placed near Pair's
  // range rather than down with the harder multi-of-one-color goals.
  'Diversified Holdings': 0.43
};

/** Canonical lookup key, matching the buckets the simulation scored. */
function draftCardKey(card: HandCard): string {
  switch (card.category) {
    case 'stock':
      // Only plain starter stocks ever appear in the setup draft pool.
      return `Starter Stock: ${card.color}`;
    case 'action':
    case 'bonus':
      return card.name;
    case 'insider_tip':
      return card.text;
    case 'goal':
      return (card as unknown as { title?: string }).title ?? card.goal.text;
  }
}

/** Static best-to-worst draft value for a setup-draft candidate card. */
export function staticDraftCardValue(card: HandCard): number {
  return STATIC_DRAFT_CARD_VALUE[draftCardKey(card)] ?? 0;
}
