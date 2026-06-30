import { useEffect, useRef, useState } from 'react';
import type { Color, StockPrices } from '@insider-trading/shared';

const HISTORY_WINDOW = 5;

/**
 * Track the last `HISTORY_WINDOW` snapshots of stock prices so the ticker can
 * show a "5-turn delta" without help from the backend. Resets when the
 * gameId changes.
 *
 * We snapshot whenever the turnNumber advances (one snapshot per turn) so the
 * delta is "now − price at turnNumber − 5".
 */
export function usePriceHistory(
  gameId: string | undefined,
  turnNumber: number,
  prices: StockPrices
): Record<Color, number> {
  const [delta, setDelta] = useState<Record<Color, number>>(() => ({ Blue: 0, Orange: 0, Yellow: 0, Purple: 0 }));
  const lastTurnRef = useRef<number>(-1);
  const lastGameRef = useRef<string | undefined>(undefined);
  // history[i] = { turn, prices } — oldest first.
  const historyRef = useRef<{ turn: number; prices: StockPrices }[]>([]);

  useEffect(() => {
    if (!gameId) return;
    if (lastGameRef.current !== gameId) {
      historyRef.current = [];
      lastTurnRef.current = -1;
      lastGameRef.current = gameId;
    }
    if (turnNumber === lastTurnRef.current) {
      // Same turn — refresh the latest snapshot in case prices shifted mid-turn
      // (e.g. an Insider Tip just resolved). Compare against the slot 5 entries back.
      if (historyRef.current.length > 0) {
        historyRef.current[historyRef.current.length - 1] = { turn: turnNumber, prices };
      } else {
        historyRef.current.push({ turn: turnNumber, prices });
      }
    } else {
      // New turn — append and trim.
      historyRef.current.push({ turn: turnNumber, prices });
      while (historyRef.current.length > HISTORY_WINDOW + 1) {
        historyRef.current.shift();
      }
      lastTurnRef.current = turnNumber;
    }

    // Delta = current − price from up to HISTORY_WINDOW turns ago.
    const hist = historyRef.current;
    const oldest = hist[0]?.prices;
    if (!oldest) {
      setDelta({ Blue: 0, Orange: 0, Yellow: 0, Purple: 0 });
      return;
    }
    setDelta({
      Blue:   prices.Blue   - oldest.Blue,
      Orange: prices.Orange - oldest.Orange,
      Yellow: prices.Yellow - oldest.Yellow,
      Purple: prices.Purple - oldest.Purple
    });
  }, [gameId, turnNumber, prices.Blue, prices.Orange, prices.Yellow, prices.Purple]);

  return delta;
}
