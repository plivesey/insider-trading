import type { PlayerPrivate } from '@insider-trading/shared';
import { colorClass, describeCard } from './cardLabel.js';
import { api } from '../lib/api.js';
import { showError } from '../lib/toast.js';

interface Props {
  player: PlayerPrivate;
  canPlayActions: boolean;
}

export function MyHand({ player, canPlayActions }: Props) {
  async function playAction(uid: string) {
    try {
      await api.freeAction({ request: { kind: 'play_action_card', cardUid: uid } });
    } catch (e) {
      showError((e as Error).message);
    }
  }

  return (
    <div className="section">
      <h3>My Hand</h3>
      <div className="card-row">
        {player.hand.length === 0 ? <em>No cards.</em> : null}
        {player.hand.map(c => {
          const d = describeCard(c);
          const action = c.category === 'action';
          return (
            <div
              key={c.uid}
              className={`${colorClass(c)} ${action && canPlayActions ? 'clickable' : ''}`}
              onClick={() => action && canPlayActions && playAction(c.uid)}
              title={action && canPlayActions ? 'Click to play' : ''}
            >
              <div className="name">{d.title}</div>
              <div className="desc">{d.sub}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
