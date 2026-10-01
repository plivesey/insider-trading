import type { GameState } from '@insider-trading/shared';
import { tipPlayThreshold } from '../../src/bots/decide.js';
import { defaultBotParams } from '../../src/bots/botParams.js';

function stateAt(progressTracker: number, progressThreshold: number): GameState {
  return { progressTracker, progressThreshold } as unknown as GameState;
}

describe('tipPlayThreshold', () => {
  test('starts at tipPlayThresholdStart when progress is 0', () => {
    const params = defaultBotParams();
    expect(tipPlayThreshold(stateAt(0, 20), params)).toBeCloseTo(params.tipPlayThresholdStart, 6);
  });

  test('decays monotonically as progress increases', () => {
    const params = defaultBotParams();
    const threshold = 20;
    let prev = tipPlayThreshold(stateAt(0, threshold), params);
    for (let tracker = 1; tracker <= threshold; tracker++) {
      const next = tipPlayThreshold(stateAt(tracker, threshold), params);
      expect(next).toBeLessThanOrEqual(prev);
      prev = next;
    }
  });

  test('clamps at the floor once progress passes the decay window', () => {
    const params = { ...defaultBotParams(), tipPlayThresholdDecayWindow: 0.5 };
    // Past the 50% decay window -- should sit exactly at the floor, not
    // keep dropping (or rise back up) beyond it.
    expect(tipPlayThreshold(stateAt(15, 20), params)).toBeCloseTo(params.tipPlayThresholdFloor, 6);
    expect(tipPlayThreshold(stateAt(20, 20), params)).toBeCloseTo(params.tipPlayThresholdFloor, 6);
  });

  test('reaches exactly the floor at progress fraction 1 with the default (whole-game) decay window', () => {
    const params = defaultBotParams(); // tipPlayThresholdDecayWindow: 1
    expect(tipPlayThreshold(stateAt(20, 20), params)).toBeCloseTo(params.tipPlayThresholdFloor, 6);
  });

  test('handles a zero progressThreshold without dividing by zero', () => {
    const params = defaultBotParams();
    expect(tipPlayThreshold(stateAt(0, 0), params)).toBeCloseTo(params.tipPlayThresholdStart, 6);
  });
});
