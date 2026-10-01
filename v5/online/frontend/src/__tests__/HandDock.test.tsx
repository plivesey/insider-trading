import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HandDock } from '../game/HandDock.js';
import { api } from '../lib/api.js';
import type {
  ActionCard,
  BonusCard,
  GoalCard,
  InsiderTipCard,
  ProjectedGameState
} from '@insider-trading/shared';

vi.mock('../lib/api.js', () => ({
  api: { freeAction: vi.fn() }
}));

const mockedApi = api as unknown as { freeAction: ReturnType<typeof vi.fn> };

beforeEach(() => {
  mockedApi.freeAction.mockReset();
  mockedApi.freeAction.mockResolvedValue({ ok: true });
});

const actionCard: ActionCard = {
  uid: 'action-1',
  category: 'action',
  id: 1,
  name: 'Windfall',
  description: 'Gain $5.',
  persistent: false,
  effect: { type: 'windfall' }
};

const marketMovementCard: InsiderTipCard = {
  uid: 'tip-1',
  category: 'insider_tip',
  id: 1,
  type: 'surge',
  text: 'Steel surges +4.',
  effect: { type: 'adjust', changes: { Blue: 4 } }
};

const goalCard: GoalCard = {
  category: 'goal',
  uid: 'goal-1',
  id: 1,
  difficulty: 'easy',
  goal: { text: 'Own 2 Steel', parsed: { type: 'pair', requirements: { Blue: 2 } } },
  reward: { text: 'Gain $8', parsed: { type: 'end_game_cash', amount: 8 } }
};

const bonusCard: BonusCard = {
  category: 'bonus',
  uid: 'bonus-1',
  id: 1,
  name: 'Nest Egg',
  description: 'Gain $7 at game end.',
  effect: { type: 'flat_cash', amount: 7 }
};

function makeState(hand: any[]): ProjectedGameState {
  return {
    myPlayer: { playerId: 'p1', name: 'Alice', cash: 20, hand, loans: 0, goalsClaimed: [], persistentEffects: [], connected: true },
    goalRow: [],
    players: []
  } as unknown as ProjectedGameState;
}

describe('HandDock — 4-way click dispatch', () => {
  it('plays an action card via play_action_card', async () => {
    render(<HandDock state={makeState([actionCard])} canPlayActions={true} />);
    fireEvent.click(screen.getByText('Windfall'));
    await waitFor(() =>
      expect(mockedApi.freeAction).toHaveBeenCalledWith({
        request: { kind: 'play_action_card', cardUid: 'action-1' }
      })
    );
  });

  it('plays a market-movement card via play_market_movement', async () => {
    render(<HandDock state={makeState([marketMovementCard])} canPlayActions={true} />);
    fireEvent.click(screen.getByText('Market Movement'));
    await waitFor(() =>
      expect(mockedApi.freeAction).toHaveBeenCalledWith({
        request: { kind: 'play_market_movement', cardUid: 'tip-1' }
      })
    );
  });

  it('opens the claim modal (does not call freeAction directly) for a goal card', () => {
    render(<HandDock state={makeState([goalCard])} canPlayActions={true} />);
    fireEvent.click(screen.getByText('Own 2 Steel'));
    expect(mockedApi.freeAction).not.toHaveBeenCalled();
    expect(screen.getByText('Reveal & Claim a Private Goal')).toBeInTheDocument();
  });

  it('is a no-op for a bonus card (no click handler, no api call)', () => {
    render(<HandDock state={makeState([bonusCard])} canPlayActions={true} />);
    fireEvent.click(screen.getByText('Nest Egg'));
    expect(mockedApi.freeAction).not.toHaveBeenCalled();
  });

  it('does not play anything when canPlayActions is false', () => {
    render(<HandDock state={makeState([actionCard])} canPlayActions={false} />);
    fireEvent.click(screen.getByText('Windfall'));
    expect(mockedApi.freeAction).not.toHaveBeenCalled();
  });
});
