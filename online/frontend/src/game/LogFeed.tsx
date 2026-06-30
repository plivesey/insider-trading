import { useState } from 'react';
import type { GameLogEntry } from '@insider-trading/shared';
import { BrassButton, Panel, relabelColors } from './theme.js';

interface Props {
  entries: GameLogEntry[];
}

export function LogFeed({ entries }: Props) {
  const reversed = entries.slice().reverse();
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <Panel
        title="Wire"
        headRight={
          <button
            className="wire-expand"
            type="button"
            onClick={() => setExpanded(true)}
            disabled={reversed.length === 0}
          >
            Expand
          </button>
        }
      >
        <div className="log-box log-box--capped">
          {reversed.length === 0 && (
            <div style={{ fontStyle: 'italic', opacity: 0.6 }}>The wire is quiet.</div>
          )}
          {reversed.map(e => (
            <div key={e.seq} className="log-entry">
              <span className="log-entry__ts">T{e.turnNumber}#{e.seq}</span>
              <span>{relabelColors(e.message)}</span>
            </div>
          ))}
        </div>
      </Panel>
      {expanded && (
        <>
          <div className="deco-overlay" onClick={() => setExpanded(false)} />
          <div className="deco-modal wire-modal">
            <h3 className="deco-modal__title">Wire</h3>
            <div className="deco-modal__body">
              <div className="log-box log-box--full">
                {reversed.map(e => (
                  <div key={e.seq} className="log-entry">
                    <span className="log-entry__ts">T{e.turnNumber}#{e.seq}</span>
                    <span>{relabelColors(e.message)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="deco-modal__footer">
              <BrassButton label="Close" onClick={() => setExpanded(false)} />
            </div>
          </div>
        </>
      )}
    </>
  );
}
