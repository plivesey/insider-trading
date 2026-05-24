import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useGameState } from '../hooks/useGameState.js';

type Listener = (ev: any) => void;

class FakeSocket {
  static instances: FakeSocket[] = [];
  url: string;
  readyState = 0;
  onopen: Listener | null = null;
  onmessage: Listener | null = null;
  onclose: Listener | null = null;
  onerror: Listener | null = null;
  constructor(url: string) {
    this.url = url;
    FakeSocket.instances.push(this);
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  message(data: unknown) {
    this.onmessage?.({ data: typeof data === 'string' ? data : JSON.stringify(data) });
  }
  close() {
    this.readyState = 3;
    this.onclose?.({});
  }
}

beforeEach(() => {
  FakeSocket.instances = [];
  (globalThis as any).WebSocket = FakeSocket;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useGameState', () => {
  it('opens a WS and surfaces state messages', async () => {
    const { result } = renderHook(() => useGameState());
    expect(FakeSocket.instances.length).toBe(1);
    const ws = FakeSocket.instances[0];
    expect(ws.url).toMatch(/\/ws$/);

    act(() => ws.open());
    expect(result.current.connected).toBe(true);

    act(() => ws.message({ type: 'state', state: { mode: 'lobby', lobby: [], canStart: false } }));
    expect(result.current.state).toEqual({ mode: 'lobby', lobby: [], canStart: false });
  });

  it('appends log entries up to 200', () => {
    const { result } = renderHook(() => useGameState());
    const ws = FakeSocket.instances[0];
    act(() => ws.open());

    const entries = Array.from({ length: 250 }, (_, i) => ({
      seq: i + 1,
      ts: '2026-05-23T00:00:00Z',
      turnNumber: 1,
      type: 'test',
      message: `e${i}`
    }));
    act(() => ws.message({ type: 'log', entries: entries.slice(0, 120) }));
    act(() => ws.message({ type: 'log', entries: entries.slice(120) }));

    expect(result.current.log.length).toBe(200);
    expect(result.current.log[0].message).toBe('e50');
    expect(result.current.log[199].message).toBe('e249');
  });

  it('reconnects with backoff after close', async () => {
    renderHook(() => useGameState());
    expect(FakeSocket.instances.length).toBe(1);
    const first = FakeSocket.instances[0];
    act(() => first.open());

    act(() => first.close());
    expect(FakeSocket.instances.length).toBe(1); // not yet
    // first backoff is 250 * 2^0 = 250ms
    await act(async () => {
      vi.advanceTimersByTime(260);
    });
    expect(FakeSocket.instances.length).toBe(2);

    const second = FakeSocket.instances[1];
    act(() => second.close());
    // second backoff is 250 * 2^1 = 500ms
    await act(async () => {
      vi.advanceTimersByTime(260);
    });
    expect(FakeSocket.instances.length).toBe(2);
    await act(async () => {
      vi.advanceTimersByTime(260);
    });
    expect(FakeSocket.instances.length).toBe(3);
  });

  it('stops reconnecting after unmount', async () => {
    const { unmount } = renderHook(() => useGameState());
    const first = FakeSocket.instances[0];
    act(() => first.open());
    unmount();
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(FakeSocket.instances.length).toBe(1);
  });
});
