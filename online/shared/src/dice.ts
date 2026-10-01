// The V6 "bag of 6 dice" mechanic (rules.md, "Dice -- The Bag of Six").

export type DieId = 'A1' | 'A2' | 'B1' | 'B2' | 'C' | 'D';
export type DieFace = 'bull' | 'bear' | 'nothing' | 'draw1' | 'draw2' | 'draw3';

/**
 * Exact 6-face multiset per die, per rules.md's dice table. V6 rebalance:
 * since the Event Deck split into a tip-only deck and a goal reserve (goals
 * are never drawn mid-game anymore), every "draw" face now guarantees a tip
 * card instead of a ~60% chance of one -- roughly 1.68x more tracker-
 * advancing value per draw-pip than before the split. To hold draw-driven
 * pacing roughly constant, total draw-pip volume across the bag was cut to
 * ~60% of its V5 level (13 -> 8 pips across C+D, the only draw-capable
 * dice): D is now a pure-draw die (5x draw1 + 1x draw2, 7 pips) and C
 * carries the one remaining draw1 needed to close the gap to the ~7.74-pip
 * target (1 pip), with its other 5 faces non-draw (1 bull, matching the
 * pre-rebalance bull count, rest nothing). Bull/bear face *counts* on every
 * die are otherwise untouched on purpose, so this rebalance isolates
 * draw-frequency only -- see v6_tuning_notes.md and v6_game_length_log.md.
 */
export const DICE: Record<DieId, DieFace[]> = {
  A1: ['bull', 'bull', 'bear', 'nothing', 'nothing', 'nothing'],
  A2: ['bull', 'bull', 'bear', 'nothing', 'nothing', 'nothing'],
  B1: ['bull', 'bull', 'nothing', 'nothing', 'nothing', 'nothing'],
  B2: ['bull', 'bull', 'nothing', 'nothing', 'nothing', 'nothing'],
  C: ['nothing', 'nothing', 'nothing', 'nothing', 'bull', 'draw1'],
  D: ['draw1', 'draw1', 'draw1', 'draw1', 'draw1', 'draw2']
};

export const ALL_DICE: DieId[] = ['A1', 'A2', 'B1', 'B2', 'C', 'D'];
