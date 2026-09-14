import { useEffect, useRef } from 'react';

// Runs `callback` `delayMs` after the last change to `deps`, but never on the
// initial mount — used to autosave edits without firing a PATCH right after
// the initial GET populates the same state.
export function useDebouncedEffect(callback: () => void, deps: unknown[], delayMs = 500): void {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(callback, delayMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
