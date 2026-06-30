import type { PlayerPrivate, PlayerPublic } from '@insider-trading/shared';
import { C, Monogram, Panel, Sep } from './theme.js';

interface Props {
  players: PlayerPublic[];
  currentPlayerIndex: number;
  myPlayer: PlayerPrivate | null;
}

export function PlayersPanel({ players, currentPlayerIndex, myPlayer }: Props) {
  return (
    <Panel title="At The Table">
      <div className="players-grid">
        {players.map((p, i) => (
          <PlayerRow
            key={p.playerId}
            player={p}
            current={i === currentPlayerIndex}
            isMe={p.playerId === myPlayer?.playerId}
          />
        ))}
      </div>
    </Panel>
  );
}

function PlayerRow({
  player,
  current,
  isMe
}: {
  player: PlayerPublic;
  current: boolean;
  isMe: boolean;
}) {
  const offline = !player.connected;
  const effects = player.persistentEffects.map(e => e.name);
  return (
    <div
      className={[
        'player-row',
        current ? 'player-row--current' : '',
        isMe ? 'player-row--me' : '',
        offline ? 'player-row--offline' : ''
      ].filter(Boolean).join(' ')}
    >
      <Monogram name={isMe ? 'You' : player.name} accent={isMe ? C.brass : C.ivory2} />
      <div className="player-row__main">
        <div className="player-row__name-row">
          <span className="player-row__name">
            {isMe ? 'YOU' : player.name.toUpperCase()}
          </span>
          {current && <span className="player-row__tag">· On the clock</span>}
          {offline && <span className="player-row__tag player-row__tag--offline">· Offline</span>}
          {(effects.length > 0 || player.hotTipAvailable) && (
            <span className="player-row__effects">
              {player.hotTipAvailable && '✦ Hot Tip'}
              {player.hotTipAvailable && effects.length > 0 && '  ·  '}
              {effects.join(' · ')}
            </span>
          )}
        </div>
        <div className="player-row__stats">
          <span className="player-row__cash">${player.cash}</span>
          <Sep />
          <span>{player.handSize} <i style={{ color: C.ivoryD }}>cards</i></span>
          <Sep />
          <span>{player.loans} <i style={{ color: C.ivoryD }}>loans</i></span>
          {player.goalsClaimed.length > 0 && (
            <>
              <Sep />
              <span>{player.goalsClaimed.length} <i style={{ color: C.ivoryD }}>goals</i></span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
