import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PromptModal } from '../game/PromptModal.js';
import { api } from '../lib/api.js';
import type { ProjectedGameState, PromptEnvelope } from '@insider-trading/shared';

vi.mock('../lib/api.js', () => ({
  api: { promptResponse: vi.fn() }
}));

const mockedApi = api as unknown as { promptResponse: ReturnType<typeof vi.fn> };

beforeEach(() => {
  mockedApi.promptResponse.mockReset();
  mockedApi.promptResponse.mockResolvedValue({ ok: true });
});

const baseState: ProjectedGameState = {
  gameId: 'g',
  startedAt: '2026-01-01T00:00:00.000Z',
  version: 5,
  variant: 'classic',
  status: 'in_progress',
  stockPrices: { Blue: 4, Orange: 4, Green: 4, Purple: 4 },
  currentPlayerIndex: 0,
  turnNumber: 1,
  players: [],
  myPlayer: null,
  market: [],
  mainDeckSize: 0,
  discardPileSize: 0,
  eventDeckSize: 0,
  resolvedEventCards: [],
  goalRow: [],
  progressTracker: 0,
  progressThreshold: 10,
  auction: null,
  myPrompt: null,
  gameOver: null
};

function foresightPrompt(): PromptEnvelope {
  return {
    promptId: 'pr-1',
    type: 'foresight_reorder',
    playerId: 'p1',
    message: 'Foresight',
    payload: {
      candidateUids: ['A', 'B', 'C', 'D'],
      cards: [
        { uid: 'A', kind: 'tip', text: 'Card A' },
        { uid: 'B', kind: 'tip', text: 'Card B' },
        { uid: 'C', kind: 'tip', text: 'Card C' },
        { uid: 'D', kind: 'tip', text: 'Card D' }
      ]
    }
  };
}

describe('PromptModal — Foresight bury toggle', () => {
  it('burying a second card un-buries the first instead of dropping it', () => {
    render(<PromptModal prompt={foresightPrompt()} state={baseState} />);

    const buryButtons = () => screen.getAllByRole('button', { name: 'Bury' });

    // Bury Card A (first of the 4 Bury buttons, in list order A,B,C,D).
    fireEvent.click(buryButtons()[0]);
    expect(screen.getByText(/Card A \(buried at the bottom\)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Un-bury' })).toBeInTheDocument();
    // Only 3 cards left with a "Bury" button (B, C, D); A now has "Un-bury" instead.
    expect(buryButtons()).toHaveLength(3);

    // Now bury Card B instead (first Bury button among the remaining B,C,D).
    fireEvent.click(buryButtons()[0]);
    expect(screen.getByText(/Card B \(buried at the bottom\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Card A \(buried at the bottom\)/)).not.toBeInTheDocument();
    // Card A must be back in the kept list with a Bury button, not silently dropped.
    expect(screen.getByText('Card A')).toBeInTheDocument();
    expect(buryButtons()).toHaveLength(3); // A, C, D

    // Submitting must produce a valid response: 3 kept + 1 buried = all 4 accounted for.
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(mockedApi.promptResponse).toHaveBeenCalledWith({
      promptId: 'pr-1',
      response: {
        keepOrder: expect.arrayContaining(['A', 'C', 'D']),
        buriedUid: 'B'
      }
    });
    const call = mockedApi.promptResponse.mock.calls[0][0];
    expect(call.response.keepOrder).toHaveLength(3);
  });

  it('the dedicated Un-bury button clears burial entirely, with all 4 candidates restored', () => {
    render(<PromptModal prompt={foresightPrompt()} state={baseState} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Bury' })[0]); // bury A
    expect(screen.getByRole('button', { name: 'Un-bury' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Un-bury' }));
    expect(screen.queryByText(/buried at the bottom/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Bury' })).toHaveLength(4);

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    const call = mockedApi.promptResponse.mock.calls[0][0];
    expect(call.response.buriedUid).toBeUndefined();
    expect(call.response.keepOrder).toHaveLength(4);
  });
});
