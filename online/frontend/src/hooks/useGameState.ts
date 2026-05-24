import { useEffect, useRef, useState } from 'react';
import type { GameLogEntry, ServerWsMessage, StateResponse } from '@insider-trading/shared';

export interface UseGameState {
  state: StateResponse | null;
  log: GameLogEntry[];
  connected: boolean;
}

export function useGameState(): UseGameState {
  const [state, setState] = useState<StateResponse | null>(null);
  const [log, setLog] = useState<GameLogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  // Track the gameId of the log buffer so we can wipe it when a new game starts.
  const logGameIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    function connect() {
      if (cancelled) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${proto}//${window.location.host}/ws`;
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => {
        setConnected(true);
        reconnectAttempts.current = 0;
      };
      ws.onmessage = e => {
        try {
          const msg = JSON.parse(e.data as string) as ServerWsMessage;
          if (msg.type === 'state') {
            // Detect game-id change → reset log so we don't mix events
            // from a previous game (or stale post-reset state) with the
            // current one. Treat "no game" as a sentinel that also clears.
            const nextGameId =
              msg.state.mode === 'in_game' || msg.state.mode === 'game_over'
                ? msg.state.state.gameId
                : null;
            if (nextGameId !== logGameIdRef.current) {
              logGameIdRef.current = nextGameId;
              setLog([]);
            }
            setState(msg.state);
          } else if (msg.type === 'log') {
            setLog(prev => [...prev, ...msg.entries].slice(-200));
          }
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (cancelled) return;
        const delay = Math.min(8000, 250 * 2 ** reconnectAttempts.current++);
        setTimeout(connect, delay);
      };
      ws.onerror = () => ws.close();
    }
    connect();
    return () => {
      cancelled = true;
      wsRef.current?.close();
    };
  }, []);

  return { state, log, connected };
}
