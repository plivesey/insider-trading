import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CardTile } from '../game/CardTile.js';
import type { BonusCard, GoalCard, StockCard } from '@insider-trading/shared';

const scout: StockCard = {
  category: 'stock',
  uid: 'stock-scout-1',
  color: 'Blue',
  type: 'peek_buy',
  name: 'Scout',
  ability: 'When bought, look at the top 1 card of the event deck.'
};

const goal: GoalCard = {
  category: 'goal',
  uid: 'goal-1',
  id: 1,
  difficulty: 'easy',
  goal: {
    text: 'Own 2 Steel and 2 Oil',
    parsed: { type: 'pair', requirements: { Blue: 2, Orange: 2 } }
  },
  reward: {
    text: 'Gain $8',
    parsed: { type: 'end_game_cash', amount: 8 }
  }
};

const bonus: BonusCard = {
  category: 'bonus',
  uid: 'bonus-1',
  id: 1,
  name: 'Nest Egg',
  description: 'Gain $7 at game end.',
  effect: { type: 'flat_cash', amount: 7 }
};

describe('CardTile — goal branch', () => {
  it('shows "Goal" (public) when goalContext is row', () => {
    render(<CardTile card={goal} goalContext="row" onClick={() => {}} />);
    expect(screen.getByText('Goal')).toBeInTheDocument();
    expect(screen.queryByText('Secret Goal')).not.toBeInTheDocument();
    expect(screen.getByText('Own 2 Steel and 2 Oil')).toBeInTheDocument();
    expect(screen.getByText('Gain $8')).toBeInTheDocument();
  });

  it('shows "Secret Goal" (private) when goalContext is hand', () => {
    render(<CardTile card={goal} goalContext="hand" onClick={() => {}} />);
    expect(screen.getByText('Secret Goal')).toBeInTheDocument();
    expect(screen.queryByText('Goal')).not.toBeInTheDocument();
  });

  it('is clickable (role=button) like other card categories', () => {
    const onClick = vi.fn();
    render(<CardTile card={goal} goalContext="row" onClick={onClick} />);
    const el = screen.getByRole('button');
    fireEvent.click(el);
    expect(onClick).toHaveBeenCalled();
  });
});

describe('CardTile — stock branch, Scout ability text', () => {
  it('shows the peek text by default (Classic)', () => {
    render(<CardTile card={scout} />);
    expect(screen.getByText('When bought, look at the top 1 card of the event deck.')).toBeInTheDocument();
  });

  it('shows the gain text in the Alternate variant', () => {
    render(<CardTile card={scout} variant="alternate" />);
    expect(screen.getByText('When bought, gain the top card of the event deck into your hand.')).toBeInTheDocument();
    expect(screen.queryByText('When bought, look at the top 1 card of the event deck.')).not.toBeInTheDocument();
  });

  it('other special stocks are unaffected by variant', () => {
    const boom: StockCard = {
      category: 'stock',
      uid: 'stock-boom-1',
      color: 'Blue',
      type: 'extra_up',
      name: 'Boom',
      ability: 'When bought, Blue rises an extra +1 (Blue rises +2 total).'
    };
    render(<CardTile card={boom} variant="alternate" />);
    // Blue is relabeled to its industry name ("Steel") by relabelColors.
    expect(screen.getByText('When bought, Steel rises an extra +1 (Steel rises +2 total).')).toBeInTheDocument();
  });
});

describe('CardTile — bonus branch', () => {
  it('renders sealed bonus content and the "never played" seal', () => {
    render(<CardTile card={bonus} />);
    expect(screen.getByText('Sealed Bonus · Game End Only')).toBeInTheDocument();
    expect(screen.getByText('Nest Egg')).toBeInTheDocument();
    expect(screen.getByText('Gain $7 at game end.')).toBeInTheDocument();
    expect(screen.getByText('Never played · scores automatically')).toBeInTheDocument();
  });

  it('is inert with no onClick supplied (e.g. shown in hand during normal play)', () => {
    render(<CardTile card={bonus} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('is clickable (role=button) when onClick is supplied, like other card categories (e.g. the setup draft picker)', () => {
    const onClick = vi.fn();
    render(<CardTile card={bonus} onClick={onClick} />);
    const el = screen.getByRole('button');
    fireEvent.click(el);
    expect(onClick).toHaveBeenCalled();
  });
});
