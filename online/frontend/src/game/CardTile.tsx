import type { ActionCard, BonusCard, GoalCard, InsiderTipCard, StockCard } from '@insider-trading/shared';
import { C, DecoCorner, INDUSTRY, IndustryIcon, industryClass, relabelColors } from './theme.js';

type Card = StockCard | ActionCard | InsiderTipCard | GoalCard | BonusCard;

interface Props {
  card: Card;
  onClick?: () => void;
  /** Render extra ornament corners (used in the fanned hand). */
  ornate?: boolean;
  className?: string;
  /** Inline style overrides — used by HandDock for fan transforms via wrapper. */
  showPlayPip?: boolean;
  /** Text for the hover pip when `showPlayPip` is true. Defaults to "Click to Play". */
  playPipLabel?: string;
  /** For a goal card: whether it's being shown from the public row or a hand (private). Irrelevant for other categories. */
  goalContext?: 'row' | 'hand';
}

export function CardTile({
  card,
  onClick,
  ornate = false,
  className = '',
  showPlayPip = false,
  playPipLabel = 'Click to Play',
  goalContext = 'row'
}: Props) {
  const indClass =
    card.category === 'stock'
      ? industryClass((card as StockCard).color)
      : card.category === 'insider_tip'
      ? 'ind-tip'
      : card.category === 'goal'
      ? 'ind-goal'
      : card.category === 'bonus'
      ? 'ind-bonus'
      : 'ind-action';
  const isBonus = card.category === 'bonus';
  const inert = !onClick;
  return (
    <div
      className={`card-tile ${indClass}${isBonus ? ' card-tile--bonus' : ''}${inert ? ' card-tile--inert' : ''} ${className}`.trim()}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : -1}
    >
      {card.category === 'stock' && <StockBody card={card as StockCard} />}
      {card.category === 'action' && <ActionBody card={card as ActionCard} />}
      {card.category === 'insider_tip' && <TipBody card={card as InsiderTipCard} />}
      {card.category === 'goal' && <GoalBody card={card as GoalCard} context={goalContext} />}
      {card.category === 'bonus' && <BonusBody card={card as BonusCard} />}
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
        <div className="card-tile__play-pip">{playPipLabel}</div>
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
      <div className="card-tile__name">{card.name}</div>
      <div className="card-tile__desc">{text}</div>
    </>
  );
}

function TipBody({ card }: { card: InsiderTipCard }) {
  const tagLabel =
    card.type === 'crash' ? 'CRASH' : card.type === 'surge' ? 'SURGE' : 'SLUMP';
  return (
    <>
      <div className="card-tile__action-tag">Market Movement · {tagLabel}</div>
      <div className="card-tile__name">Market Movement</div>
      <div className="card-tile__desc">{relabelColors(card.text)}</div>
    </>
  );
}

function GoalBody({ card, context }: { card: GoalCard; context: 'row' | 'hand' }) {
  const isPrivate = context === 'hand';
  return (
    <>
      <div className={`card-tile__action-tag ${isPrivate ? 'card-tile__action-tag--private' : 'card-tile__action-tag--public'}`}>
        {isPrivate ? 'Secret Goal' : 'Goal'}
      </div>
      <div className="card-tile__name">{relabelColors(card.goal.text)}</div>
      <div className="card-tile__desc">{relabelColors(card.reward.text)}</div>
    </>
  );
}

function BonusBody({ card }: { card: BonusCard }) {
  return (
    <>
      <div className="card-tile__action-tag">Sealed Bonus · Game End Only</div>
      <div className="card-tile__name">{card.name}</div>
      <div className="card-tile__desc">{relabelColors(card.description)}</div>
      <div className="card-tile__seal">Never played · scores automatically</div>
    </>
  );
}
