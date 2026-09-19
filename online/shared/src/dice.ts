// The V5 "bag of 6 dice" mechanic (rules.md, "Dice -- The Bag of Six").
// Replaces V4's single d6.

export type DieId = 'A1' | 'A2' | 'B1' | 'B2' | 'C' | 'D';
export type DieFace = 'bull' | 'bear' | 'nothing' | 'draw1' | 'draw2' | 'draw3';

/** Exact 6-face multiset per die, per rules.md's dice table. */
export const DICE: Record<DieId, DieFace[]> = {
  A1: ['bull', 'bull', 'bear', 'nothing', 'nothing', 'nothing'],
  A2: ['bull', 'bull', 'bear', 'nothing', 'nothing', 'nothing'],
  B1: ['bull', 'bull', 'nothing', 'nothing', 'nothing', 'nothing'],
  B2: ['bull', 'bull', 'nothing', 'nothing', 'nothing', 'nothing'],
  // One "nothing" swapped for "bull" to offset the added bearish tilt from
  // the expanded Insider Tip pool (more Crash cards, no more Surge).
  C: ['nothing', 'nothing', 'bull', 'draw1', 'draw2', 'draw3'],
  D: ['draw1', 'draw1', 'draw1', 'draw2', 'draw2', 'draw2']
};

export const ALL_DICE: DieId[] = ['A1', 'A2', 'B1', 'B2', 'C', 'D'];
