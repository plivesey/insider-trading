import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Lobby } from '../pages/Lobby.js';
import { api } from '../lib/api.js';

vi.mock('../lib/api.js', () => ({
  api: {
    join: vi.fn(),
    start: vi.fn()
  }
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
    render(<Lobby state={emptyState} myName={null} />);
    expect(screen.getByText('No one has joined yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Start Game/ })).not.toBeInTheDocument();
  });

  it('enables Join once a name is typed and calls api.join on click', async () => {
    mockedApi.join.mockResolvedValue({ playerId: 'p1', name: 'Alice' });
    render(<Lobby state={emptyState} myName={null} />);
    const input = screen.getByPlaceholderText('Your name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Alice' } });
    const btn = screen.getByRole('button', { name: 'Join' });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    await waitFor(() => expect(mockedApi.join).toHaveBeenCalledWith('Alice'));
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
    render(<Lobby state={state} myName="Alice" />);
    expect(screen.getByText(/Alice/)).toBeInTheDocument();
    expect(screen.getByText(/Bob/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Your name')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start Game \(2 players\)/ })).toBeEnabled();
  });

  it('surfaces join errors', async () => {
    mockedApi.join.mockRejectedValue(new Error('name taken'));
    render(<Lobby state={emptyState} myName={null} />);
    fireEvent.change(screen.getByPlaceholderText('Your name'), { target: { value: 'Alice' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    await waitFor(() => expect(screen.getByText('name taken')).toBeInTheDocument());
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
    render(<Lobby state={state} myName="Alice" />);
    fireEvent.click(screen.getByRole('button', { name: /Start Game/ }));
    await waitFor(() => expect(mockedApi.start).toHaveBeenCalled());
  });
});
