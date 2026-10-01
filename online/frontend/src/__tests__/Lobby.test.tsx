import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Lobby } from '../pages/Lobby.js';
import { api } from '../lib/api.js';

vi.mock('../lib/api.js', () => ({
  api: {
    join: vi.fn(),
    start: vi.fn()
  },
  getBackendOverride: vi.fn(() => null),
  setBackendOverride: vi.fn(),
  clearBackendOverride: vi.fn()
}));

const mockedApi = api as unknown as {
  join: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  mockedApi.join.mockReset();
  mockedApi.start.mockReset();
});

const emptyState = { mode: 'lobby' as const, lobby: [], canStart: false };

describe('Lobby', () => {
  it('renders empty lobby with disabled Join button', () => {
    render(<Lobby state={emptyState} myName={null} onJoined={vi.fn()} />);
    expect(screen.getByText('No one has joined yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Start Game/ })).not.toBeInTheDocument();
  });

  it('enables Join once a name is typed, calls api.join on click, then reconnects the socket', async () => {
    mockedApi.join.mockResolvedValue({ playerId: 'p1', name: 'Alice' });
    const onJoined = vi.fn();
    render(<Lobby state={emptyState} myName={null} onJoined={onJoined} />);
    const input = screen.getByPlaceholderText('Your name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Alice' } });
    const btn = screen.getByRole('button', { name: 'Join' });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    await waitFor(() => expect(mockedApi.join).toHaveBeenCalledWith('Alice'));
    // Reconnecting the WS after join is what picks up the cookie /api/join
    // just set, for a tab whose socket opened (with no cookie yet) before
    // this was the first join -- see useGameState's `reconnect`.
    await waitFor(() => expect(onJoined).toHaveBeenCalled());
  });

  it('shows joined names and hides the input once myName matches a lobby entry', () => {
    const state = {
      mode: 'lobby' as const,
      lobby: [
        { playerId: 'p1', name: 'Alice', connected: true },
        { playerId: 'p2', name: 'Bob', connected: true }
      ],
      canStart: true
    };
    render(<Lobby state={state} myName="Alice" onJoined={vi.fn()} />);
    expect(screen.getByText(/Alice/)).toBeInTheDocument();
    expect(screen.getByText(/Bob/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Your name')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start Game \(2 players\)/ })).toBeEnabled();
  });

  it('surfaces join errors without reconnecting the socket', async () => {
    mockedApi.join.mockRejectedValue(new Error('name taken'));
    const onJoined = vi.fn();
    render(<Lobby state={emptyState} myName={null} onJoined={onJoined} />);
    fireEvent.change(screen.getByPlaceholderText('Your name'), { target: { value: 'Alice' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    await waitFor(() => expect(screen.getByText('name taken')).toBeInTheDocument());
    expect(onJoined).not.toHaveBeenCalled();
  });

  it('calls api.start when Start Game clicked', async () => {
    mockedApi.start.mockResolvedValue({ ok: true });
    const state = {
      mode: 'lobby' as const,
      lobby: [
        { playerId: 'p1', name: 'Alice', connected: true },
        { playerId: 'p2', name: 'Bob', connected: true }
      ],
      canStart: true
    };
    render(<Lobby state={state} myName="Alice" onJoined={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Start Game/ }));
    await waitFor(() => expect(mockedApi.start).toHaveBeenCalledWith());
  });
});
