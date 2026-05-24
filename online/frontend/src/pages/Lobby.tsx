import { useState } from 'react';
import type { StateResponse } from '@insider-trading/shared';
import { api } from '../lib/api.js';

interface Props {
  state: Extract<StateResponse, { mode: 'lobby' }>;
  myName: string | null;
}

export function Lobby({ state, myName }: Props) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function join() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.join(name.trim());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'failed');
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    setError(null);
    try {
      await api.start();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'failed');
    }
  }

  const alreadyJoined = !!myName && state.lobby.some(p => p.name === myName);

  return (
    <div className="lobby">
      <h1>Insider Trading — Playtest</h1>
      <h2>Lobby</h2>
      <ul>
        {state.lobby.length === 0 ? <li><em>No one has joined yet.</em></li> : null}
        {state.lobby.map(p => (
          <li key={p.playerId}>
            {p.name} {p.connected ? '' : '(offline)'} {myName === p.name ? '— you' : ''}
          </li>
        ))}
      </ul>
      {!alreadyJoined && (
        <div className="join-row">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your name"
            onKeyDown={e => e.key === 'Enter' && join()}
          />
          <button onClick={join} disabled={busy || !name.trim()}>
            Join
          </button>
        </div>
      )}
      {state.canStart && (
        <button onClick={start} className="start-btn">
          Start Game ({state.lobby.length} players)
        </button>
      )}
      {error && <div className="error">{error}</div>}
      <p className="hint">
        Once started, anyone joining later sees only "Game in progress" until the game ends.
      </p>
    </div>
  );
}
