import { useState } from 'react';
import type { ProjectedGameState } from '@insider-trading/shared';
import { api } from '../lib/api.js';
import { showError } from '../lib/toast.js';
import { CardTile } from './CardTile.js';

interface Props {
  state: ProjectedGameState;
  canPlayActions: boolean;
}

export function HandDock({ state, canPlayActions }: Props) {
  const me = state.myPlayer;
  const [hovered, setHovered] = useState<string | null>(null);

  if (!me) return null;

  const N = me.hand.length;

  async function playAction(uid: string) {
    try {
      await api.freeAction({ request: { kind: 'play_action_card', cardUid: uid } });
    } catch (e) {
      showError((e as Error).message);
    }
  }

  async function playInsiderTip(uid: string) {
    try {
      await api.freeAction({ request: { kind: 'play_insider_tip', cardUid: uid } });
    } catch (e) {
      showError((e as Error).message);
    }
  }

  return (
    <div className="gb-hand">
      <div className={`gb-hand__cards${hovered ? ' has-hover' : ''}`}>
        {me.hand.map((c, i) => {
          const center = (N - 1) / 2;
          const offset = i - center;
          const rot = offset * 3.5;
          const ty  = Math.abs(offset) * 6;
          const tx  = offset * -8;
          const isHover = hovered === c.uid;
          const transform = isHover
            ? `translate(${tx}px, -30px) rotate(0deg) scale(1.06)`
            : `translate(${tx}px, ${ty}px) rotate(${rot}deg)`;
          const isAction = c.category === 'action';
          const isTip = c.category === 'insider_tip';
          const playable = canPlayActions && (isAction || isTip);
          const onClick = playable
            ? () => (isTip ? playInsiderTip(c.uid) : playAction(c.uid))
            : undefined;
          return (
            <div
              key={c.uid}
              className={`hand-card-slot${isHover ? ' is-hovered' : ''}`}
              style={{
                marginLeft: i === 0 ? 0 : -28,
                transform,
                zIndex: isHover ? 100 : i
              }}
              onMouseEnter={() => setHovered(c.uid)}
              onMouseLeave={() => setHovered(null)}
            >
              <CardTile
                card={c as any}
                ornate
                className="hand-card"
                onClick={onClick}
                showPlayPip={playable && isHover}
              />
            </div>
          );
        })}
      </div>

      <div className="gb-hand__cluster">
        <CashChip cash={me.cash} />
      </div>
    </div>
  );
}

function CashChip({ cash }: { cash: number }) {
  return (
    <div className="cash-chip">
      <span className="cash-chip__label">CASH</span>
      <span className="cash-chip__value">${cash}</span>
    </div>
  );
}

