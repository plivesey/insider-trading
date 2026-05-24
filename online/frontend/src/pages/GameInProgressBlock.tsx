import { useState } from 'react';
import { api } from '../lib/api.js';
import { showError } from '../lib/toast.js';

export function GameInProgressBlock() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function reset() {
    setBusy(true);
    try {
      await api.reset();
      setConfirming(false);
    } catch (e) {
      showError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="block">
      <h1>Insider Trading</h1>
      <h2>Game in progress</h2>
      <p>A game is currently being played. Wait for it to finish, then refresh this page to join the next lobby.</p>
      <hr style={{ margin: '1.5rem 0', borderColor: '#444' }} />
      <p style={{ fontSize: 12, color: '#888' }}>
        Stuck? If you know no game is actually running (e.g. left over from a previous session),
        force the server back to the lobby.
      </p>
      {!confirming ? (
        <button onClick={() => setConfirming(true)} className="reset-btn">
          Force reset server
        </button>
      ) : (
        <div>
          <p style={{ color: '#ffaaaa' }}>
            This will kick every connected player and discard the current game. Continue?
          </p>
          <button onClick={reset} disabled={busy} className="reset-btn danger">
            {busy ? 'Resetting…' : 'Yes, reset'}
          </button>
          <button onClick={() => setConfirming(false)} disabled={busy} style={{ marginLeft: 8 }}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
