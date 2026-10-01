import { adjust, halve, adjustAll, setPrice, priceOf } from '../../src/domain/prices.js';
import type { StockPrices } from '@insider-trading/shared';

const make = (): StockPrices => ({ Blue: 4, Orange: 4, Green: 4, Purple: 4 });

describe('prices', () => {
  it('adjust applies delta and floors at 0', () => {
    const p = make();
    expect(adjust(p, 'Blue', 3)).toBe(7);
    expect(adjust(p, 'Blue', -100)).toBe(0);
    expect(p.Blue).toBe(0);
  });
  it('halve rounds down and floors at 0', () => {
    const p = make();
    p.Blue = 7;
    expect(halve(p, 'Blue')).toBe(3);
    p.Orange = 1;
    expect(halve(p, 'Orange')).toBe(0);
    p.Green = 0;
    expect(halve(p, 'Green')).toBe(0);
  });
  it('adjustAll moves every color', () => {
    const p = make();
    adjustAll(p, 1);
    expect(p).toEqual({ Blue: 5, Orange: 5, Green: 5, Purple: 5 });
    adjustAll(p, -10);
    expect(p).toEqual({ Blue: 0, Orange: 0, Green: 0, Purple: 0 });
  });
  it('setPrice clamps below 0', () => {
    const p = make();
    setPrice(p, 'Blue', 12);
    expect(p.Blue).toBe(12);
    setPrice(p, 'Blue', -3);
    expect(p.Blue).toBe(0);
  });
  it('priceOf returns 0 for Wild and color price otherwise', () => {
    const p = make();
    p.Green = 9;
    expect(priceOf({ stockPrices: p }, 'Green')).toBe(9);
    expect(priceOf({ stockPrices: p }, 'Wild')).toBe(0);
  });
});
