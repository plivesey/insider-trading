import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCards } from '@insider-trading/shared';
import { staticDraftCardValue } from '../../src/bots/draftCardRanking.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.resolve(HERE, '../../../../cards');
const catalog = loadCards(CARDS_DIR);

describe('staticDraftCardValue', () => {
  it('recognizes every card that can actually appear in the setup draft pool', () => {
    // The draft pool is built entirely from the starter deck + the event
    // deck (insider tips + goals) -- never the market deck. Every card from
    // those three sources must resolve to a real (nonzero) ranking, or the
    // static table has a key mismatch and is silently treating that card as
    // worst-possible.
    const drawable = [...catalog.starterDeck, ...catalog.insiderTips, ...catalog.goals];
    for (const card of drawable) {
      expect(staticDraftCardValue(card)).toBeGreaterThan(0);
    }
  });

  it('ranks a plain starter stock above the weakest goal', () => {
    const stock = catalog.starterDeck.find(c => c.category === 'stock')!;
    const worstGoal = catalog.goals.reduce((worst, g) =>
      staticDraftCardValue(g) < staticDraftCardValue(worst) ? g : worst
    );
    expect(staticDraftCardValue(stock)).toBeGreaterThan(staticDraftCardValue(worstGoal));
  });

  it('falls back to 0 for a card key with no table entry', () => {
    const bogus = { category: 'action', uid: 'x', id: 999, name: 'Not A Real Card', description: '', persistent: false, effect: { type: 'windfall' } } as const;
    expect(staticDraftCardValue(bogus as any)).toBe(0);
  });
});
