import type { ActionCard, StockCard } from '@insider-trading/shared';
import { colorClass, describeCard } from './cardLabel.js';

interface Props {
  market: (StockCard | ActionCard)[];
}

export function MarketPanel({ market }: Props) {
  return (
    <div className="section">
      <h3>Market</h3>
      <div className="card-row">
        {market.map(c => {
          const d = describeCard(c as any);
          return (
            <div key={c.uid} className={colorClass(c as any)}>
              <div className="name">{d.title}</div>
              <div className="desc">{d.sub}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
