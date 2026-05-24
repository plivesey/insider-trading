import type { GameLogEntry } from '@insider-trading/shared';

interface Props {
  entries: GameLogEntry[];
}

export function LogFeed({ entries }: Props) {
  return (
    <div className="section">
      <h3>Log</h3>
      <div className="log-feed">
        {entries.slice().reverse().map(e => (
          <div key={e.seq} className="entry">
            <span className="ts">T{e.turnNumber}#{e.seq}</span>
            {e.message}
          </div>
        ))}
      </div>
    </div>
  );
}
