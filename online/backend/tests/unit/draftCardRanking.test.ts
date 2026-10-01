import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCards } from '@insider-trading/shared';
import { staticDraftCardValue } from '../../src/bots/draftCardRanking.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.resolve(HERE, '../../../../cards');
const catalog = loadCards(CARDS_DIR);

describe('staticDraftCardValue', () => {
  it('recognizes every card that can actually appear in the setup draft pool', () => {
    // V6's draft pool is built entirely from the tip deck + goal reserve
    // (insider tips + goals, 50/50 split) -- never the market deck, and
    // never the starter stock (dealt directly to every player, outside the
    // draft entirely). Every card from those two sources must resolve to a
    // real (nonzero) ranking, or the static table has a key mismatch and is
    // silently treating that card as worst-possible.
    const drawable = [...catalog.insiderTips, ...catalog.goals];
    for (const card of drawable) {
      expect(staticDraftCardValue(card)).toBeGreaterThan(0);
    }
  });

  it('ranks the best goal above the weakest goal', () => {
    const bestGoal = catalog.goals.reduce((best, g) =>
      staticDraftCardValue(g) > staticDraftCardValue(best) ? g : best
    );
    const worstGoal = catalog.goals.reduce((worst, g) =>
      staticDraftCardValue(g) < staticDraftCardValue(worst) ? g : worst
    );
    expect(staticDraftCardValue(bestGoal)).toBeGreaterThan(staticDraftCardValue(worstGoal));
  });

  it('falls back to 0 for a card key with no table entry', () => {
    const bogus = { category: 'action', uid: 'x', id: 999, name: 'Not A Real Card', description: '', persistent: false, effect: { type: 'windfall' } } as const;
    expect(staticDraftCardValue(bogus as any)).toBe(0);
  });
});
