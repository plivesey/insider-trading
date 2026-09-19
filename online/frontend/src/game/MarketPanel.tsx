import type { ActionCard, GameVariant, GoalCard, InsiderTipCard, StockCard } from '@insider-trading/shared';
import { Panel } from './theme.js';
import { CardTile } from './CardTile.js';

interface Props {
  market: (StockCard | ActionCard | InsiderTipCard | GoalCard)[];
  onPick?: (uid: string) => void;
  selectedUid?: string | null;
  variant?: GameVariant;
}

export function MarketPanel({ market, onPick, selectedUid, variant }: Props) {
  return (
    <Panel title="The Market">
      <div className="card-row">
        {market.map(c => (
          <CardTile
            key={c.uid}
            card={c}
            onClick={onPick ? () => onPick(c.uid) : undefined}
            className={selectedUid === c.uid ? 'card-tile--selected' : ''}
            variant={variant}
          />
        ))}
      </div>
    </Panel>
  );
}
