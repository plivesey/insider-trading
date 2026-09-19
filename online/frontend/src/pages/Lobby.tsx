import { useState } from 'react';
import type { GameVariant, StateResponse } from '@insider-trading/shared';
import {
  api,
  clearBackendOverride,
  getBackendOverride,
  setBackendOverride
} from '../lib/api.js';
import { BrassButton, C, DecoBadge, Monogram } from '../game/theme.js';

interface Props {
  state: Extract<StateResponse, { mode: 'lobby' }>;
  myName: string | null;
}

export function Lobby({ state, myName }: Props) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [backendUrl, setBackendUrl] = useState(getBackendOverride() ?? '');
  const [variant, setVariant] = useState<GameVariant>('classic');

  function applyBackend() {
    if (!backendUrl.trim()) return;
    setBackendOverride(backendUrl);
    window.location.reload();
  }

  function resetBackend() {
    clearBackendOverride();
    window.location.reload();
  }

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
      await api.start(variant);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'failed');
    }
  }

  async function addBot() {
    setError(null);
    try {
      await api.addBot();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'failed');
    }
  }

  const alreadyJoined = !!myName && state.lobby.some(p => p.name === myName);

  return (
    <div className="lobby-shell">
      <div className="lobby lobby-card">
        <div className="lobby-card__head">
          <DecoBadge size={56} />
          <div>
            <div className="lobby-card__title">INSIDER TRADING</div>
            <div className="lobby-card__sub">EST. MCMXX · PLAYTEST LOBBY</div>
          </div>
        </div>

        <div className="lobby-card__section-title">At The Table</div>
        <ul className="lobby-list">
          {state.lobby.length === 0 && (
            <li className="is-empty"><em>No one has joined yet.</em></li>
          )}
          {state.lobby.map(p => {
            const isYou = myName === p.name;
            return (
              <li key={p.playerId}>
                <Monogram name={p.name} accent={isYou ? C.brass : C.ivory2} />
                <span className="lobby-list__name">{p.name}</span>
                {p.isBot && <span className="lobby-list__tag">· Bot</span>}
                {!p.connected && !p.isBot && (
                  <span className="lobby-list__tag lobby-list__tag--offline">· Offline</span>
                )}
                {isYou && <span className="lobby-list__tag lobby-list__tag--you">· You</span>}
              </li>
            );
          })}
        </ul>

        {!alreadyJoined && (
          <div className="lobby-join">
            <input
              className="deco-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your name"
              onKeyDown={e => e.key === 'Enter' && join()}
            />
            <BrassButton
              label="Join"
              primary
              onClick={join}
              disabled={busy || !name.trim()}
            />
          </div>
        )}

        <div className="lobby-actions">
          {state.lobby.length < 6 && (
            <BrassButton label="Add Bot" onClick={addBot} />
          )}
          {state.canStart && (
            <>
              <label className="lobby-variant">
                <span className="lobby-variant__label">Ruleset</span>
                <select
                  className="deco-input"
                  value={variant}
                  onChange={e => setVariant(e.target.value as GameVariant)}
                >
                  <option value="classic">Classic</option>
                  <option value="alternate">Alternate</option>
                </select>
              </label>
              <BrassButton
                label={`Start Game (${state.lobby.length} players)`}
                primary
                onClick={start}
              />
            </>
          )}
        </div>

        {error && <div className="lobby-error">{error}</div>}

        <p className="lobby-hint">
          Once started, anyone joining later sees only "Game in progress" until the game ends.
        </p>

        <details className="lobby-backend">
          <summary>
            Backend: {getBackendOverride() ?? 'default (same origin)'}
          </summary>
          <div className="lobby-backend__row">
            <input
              className="deco-input"
              value={backendUrl}
              onChange={e => setBackendUrl(e.target.value)}
              placeholder="https://xxxx.ngrok-free.app"
              onKeyDown={e => e.key === 'Enter' && applyBackend()}
            />
            <BrassButton label="Apply" onClick={applyBackend} disabled={!backendUrl.trim()} />
            <BrassButton label="Reset" onClick={resetBackend} disabled={!getBackendOverride()} />
          </div>
          <p className="lobby-hint">
            Stored in sessionStorage; cleared when the tab closes. Page reloads on apply.
          </p>
        </details>
      </div>
    </div>
  );
}
