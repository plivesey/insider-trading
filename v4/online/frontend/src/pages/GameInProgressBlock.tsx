import { useState } from 'react';
import { api } from '../lib/api.js';
import { showError } from '../lib/toast.js';
import { BrassButton } from '../game/theme.js';

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
    <div className="block-shell">
      <div className="block-card block">
        <div className="block-card__title">Game In Progress</div>
        <div className="block-card__sub">
          A game is currently being played. Take a seat at the next round — refresh this page when it ends.
        </div>
        <div className="block-card__divider" />
        <div className="block-card__footnote">
          Stuck? If you know no game is actually running (e.g. left over from a previous session), force the server back to the lobby.
        </div>
        {!confirming ? (
          <BrassButton label="Force reset server" onClick={() => setConfirming(true)} />
        ) : (
          <>
            <div className="block-card__footnote" style={{ color: '#d65454' }}>
              This will kick every connected player and discard the current game. Continue?
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
              <BrassButton
                label={busy ? 'Resetting…' : 'Yes, reset'}
                onClick={reset}
                disabled={busy}
                className="brass-btn--danger"
              />
              <BrassButton label="Cancel" onClick={() => setConfirming(false)} disabled={busy} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
