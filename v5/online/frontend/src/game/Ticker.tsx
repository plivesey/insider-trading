import type { Color, StockPrices } from '@insider-trading/shared';
import { DecoCorner, INDUSTRY, INDUSTRY_ORDER, IndustryIcon, industryClass, C } from './theme.js';

interface Props {
  prices: StockPrices;
  delta5: Record<Color, number>;
  hideDelta?: boolean;
}

export function Ticker({ prices, delta5, hideDelta = false }: Props) {
  return (
    <div className="gb-ticker">
      {INDUSTRY_ORDER.map(color => (
        <TickerTile
          key={color}
          color={color}
          price={prices[color]}
          delta={delta5[color] ?? 0}
          hideDelta={hideDelta}
        />
      ))}
    </div>
  );
}

function TickerTile({
  color, price, delta, hideDelta
}: { color: Color; price: number; delta: number; hideDelta: boolean }) {
  const meta = INDUSTRY[color];
  const up = delta > 0;
  const dn = delta < 0;
  const deltaClass = up ? 'ticker-tile__delta-value--up' : dn ? 'ticker-tile__delta-value--down' : '';
  return (
    <div className={`ticker-tile ${industryClass(color)}`}>
      <div className="ticker-tile__edge" />
      <div className="ticker-tile__deco">
        <DecoCorner size={16} color={C.brass} rotate={90} />
      </div>
      <div className="ticker-tile__avatar">
        <IndustryIcon industry={meta.icon} color={meta.accent} size={28} stroke={1.6} />
      </div>
      <div className="ticker-tile__body">
        <div className="ticker-tile__label">{meta.label}</div>
        <div className="ticker-tile__price">${price}</div>
      </div>
      {!hideDelta && (
        <div className="ticker-tile__delta">
          <div className={`ticker-tile__delta-value ${deltaClass}`.trim()}>
            {up ? '▲' : dn ? '▼' : '·'} {Math.abs(delta)}
          </div>
          <div className="ticker-tile__delta-label">5·TURN</div>
        </div>
      )}
    </div>
  );
}
