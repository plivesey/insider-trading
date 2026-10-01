import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { DieRollOverlay } from '../game/DieRollOverlay.js';
import type { GameLogEntry } from '@insider-trading/shared';

function entry(
  seq: number,
  type: string,
  message: string,
  payload?: Record<string, unknown>,
  actor?: string
): GameLogEntry {
  return { seq, ts: '2026-01-01T00:00:00.000Z', turnNumber: 1, type, message, payload, actor };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('DieRollOverlay', () => {
  it('shows "Market Movement Played" for a hand-played tip card, without a die phase', () => {
    const log: GameLogEntry[] = [
      entry(1, 'market_movement_played', 'Alice plays a market-movement card from hand', {
        actor: 'p1',
        uid: 'itip-1'
      }),
      entry(2, 'market_movement_resolved', 'Market movement played from hand: Blue halved', {
        uid: 'itip-1',
        text: 'Blue halved',
        source: 'played_from_hand'
      })
    ];
    render(<DieRollOverlay log={log} />);
    expect(screen.getByText('Market Movement Played')).toBeInTheDocument();
    // relabelColors translates Blue -> Steel for display.
    expect(screen.getByText(/Steel halved/)).toBeInTheDocument();
  });

  it('shows "Goal Claimed" with the claiming player\'s name for a public claim', () => {
    const log: GameLogEntry[] = [
      entry(1, 'goal_claimed', 'Bob claims "2 Blue" (reward: Gain $4)', {
        actor: 'p2',
        goalUid: 'goal-1',
        goalText: '2 Blue',
        rewardText: 'Gain $4'
      })
    ];
    render(<DieRollOverlay log={log} />);
    expect(screen.getByText('Goal Claimed')).toBeInTheDocument();
    expect(screen.getByText(/Bob claims/)).toBeInTheDocument();
  });

  it('shows "Goal Claimed" for a private goal reveal-and-claim too', () => {
    const log: GameLogEntry[] = [
      entry(1, 'private_goal_claimed', 'Carol reveals and claims a private goal: "2 Purple" (reward: Gain $4)', {
        actor: 'p3'
      })
    ];
    render(<DieRollOverlay log={log} />);
    expect(screen.getByText('Goal Claimed')).toBeInTheDocument();
  });

  it('suppresses the "Goal Claimed" popover for the claiming player themselves', () => {
    const log: GameLogEntry[] = [
      entry(1, 'goal_claimed', 'Bob claims "2 Blue" (reward: Gain $4)', { goalUid: 'goal-1' }, 'p2')
    ];
    render(<DieRollOverlay log={log} myPlayerId="p2" />);
    expect(screen.queryByText('Goal Claimed')).not.toBeInTheDocument();
  });

  it('still shows the "Goal Claimed" popover to everyone else when another player claims', () => {
    const log: GameLogEntry[] = [
      entry(1, 'goal_claimed', 'Bob claims "2 Blue" (reward: Gain $4)', { goalUid: 'goal-1' }, 'p2')
    ];
    render(<DieRollOverlay log={log} myPlayerId="p1" />);
    expect(screen.getByText('Goal Claimed')).toBeInTheDocument();
  });

  it('still runs the die phase for a dice draw, and the resulting card is always Market Movement (never a goal)', () => {
    const log: GameLogEntry[] = [
      entry(1, 'die_roll', 'Dice bag: drew D, rolled draw1', { die: 'D', face: 'draw1' }),
      entry(2, 'market_movement_resolved', 'Market movement drawn: Orange +4', {
        uid: 'itip-2',
        text: 'Orange +4',
        source: 'drawn'
      })
    ];
    render(<DieRollOverlay log={log} />);
    expect(screen.getByText('Die D · Draw 1 Event')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2600);
    });
    expect(screen.getByText('Market Movement')).toBeInTheDocument();
    // relabelColors translates Orange -> Oil for display.
    expect(screen.getByText(/Oil \+4/)).toBeInTheDocument();
  });

  it('the card-reveal phase stays on screen for 5600ms (doubled from 2800ms)', () => {
    const log: GameLogEntry[] = [
      entry(1, 'goal_claimed', 'Dave claims "2 Green" (reward: Gain $4)', { actor: 'p4' })
    ];
    render(<DieRollOverlay log={log} />);
    expect(screen.getByText('Goal Claimed')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText('Goal Claimed')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(screen.queryByText('Goal Claimed')).not.toBeInTheDocument();
  });
});
