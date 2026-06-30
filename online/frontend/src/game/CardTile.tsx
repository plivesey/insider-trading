import type { ActionCard, InsiderTipCard, StockCard } from '@insider-trading/shared';
import { C, DecoCorner, INDUSTRY, IndustryIcon, industryClass, relabelColors } from './theme.js';

type Card = StockCard | ActionCard | InsiderTipCard;

interface Props {
  card: Card;
  onClick?: () => void;
  /** Render extra ornament corners (used in the fanned hand). */
  ornate?: boolean;
  className?: string;
  /** Inline style overrides — used by HandDock for fan transforms via wrapper. */
  showPlayPip?: boolean;
}

export function CardTile({ card, onClick, ornate = false, className = '', showPlayPip = false }: Props) {
  const indClass =
    card.category === 'stock'
      ? industryClass((card as StockCard).color)
      : card.category === 'insider_tip'
      ? 'ind-tip'
      : 'ind-action';
  return (
    <div
      className={`card-tile ${indClass} ${className}`.trim()}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : -1}
    >
      {card.category === 'stock' && <StockBody card={card as StockCard} />}
      {card.category === 'action' && <ActionBody card={card as ActionCard} />}
      {card.category === 'insider_tip' && <TipBody card={card as InsiderTipCard} />}
      <div className="card-tile__deco card-tile__deco--tr">
        <DecoCorner size={14} color={C.brass} rotate={90} />
      </div>
      <div className="card-tile__deco card-tile__deco--bl">
        <DecoCorner size={14} color={C.brass} rotate={270} />
      </div>
      {ornate && (
        <>
          <div className="card-tile__deco card-tile__deco--tl">
            <DecoCorner size={14} color={C.brass} />
          </div>
          <div className="card-tile__deco card-tile__deco--br">
            <DecoCorner size={14} color={C.brass} rotate={180} />
          </div>
        </>
      )}
      {showPlayPip && (
        <div className="card-tile__play-pip">Click to Play</div>
      )}
    </div>
  );
}

function StockBody({ card }: { card: StockCard }) {
  const meta = INDUSTRY[card.color];
  return (
    <>
      <div className="card-tile__category">
        <span className="card-tile__dot" />
        {meta.label}
      </div>
      <div className="card-tile__art">
        <IndustryIcon industry={meta.icon} color={meta.accent} size={56} stroke={1.4} />
        <div className="card-tile__art-mono card-tile__art-mono--tl">{meta.mono}</div>
        <div className="card-tile__art-mono card-tile__art-mono--br">{meta.mono}</div>
      </div>
      <div className="card-tile__name">{card.name ?? 'Common Share'}</div>
      {card.ability && (
        <div className="card-tile__desc">{relabelColors(card.ability)}</div>
      )}
    </>
  );
}

function ActionBody({ card }: { card: ActionCard }) {
  const text = relabelColors(card.description);
  return (
    <>
      <div className="card-tile__action-tag">Action</div>
      <div className="card-tile__art card-tile__art--action">
        <span className="card-tile__art-label">art</span>
      </div>
      <div className="card-tile__name">{card.name}</div>
      <div className="card-tile__desc">
        {text.length > 70 ? text.slice(0, 68) + '…' : text}
      </div>
    </>
  );
}

function TipBody({ card }: { card: InsiderTipCard }) {
  const tagLabel =
    card.type === 'crash' ? 'CRASH' : card.type === 'surge' ? 'SURGE' : 'SLUMP';
  return (
    <>
      <div className="card-tile__action-tag">Insider Tip · {tagLabel}</div>
      <div className="card-tile__art card-tile__art--action">
        <span className="card-tile__art-label">tip</span>
      </div>
      <div className="card-tile__name">Insider Tip</div>
      <div className="card-tile__desc">{relabelColors(card.text)}</div>
    </>
  );
}
