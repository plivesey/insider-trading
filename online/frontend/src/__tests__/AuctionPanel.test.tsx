import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuctionPanel } from '../game/AuctionPanel.js';
import { api } from '../lib/api.js';
import type { AuctionState, PlayerPublic, PromptEnvelope, ActionCard } from '@insider-trading/shared';

vi.mock('../lib/api.js', () => ({
  api: { auctionBid: vi.fn() }
}));

const mockedApi = api as unknown as { auctionBid: ReturnType<typeof vi.fn> };

beforeEach(() => {
  mockedApi.auctionBid.mockReset();
  mockedApi.auctionBid.mockResolvedValue({ ok: true });
});

const players: PlayerPublic[] = [
  { playerId: 'p1', name: 'Alice', cash: 30, handSize: 0, hotTipAvailable: true, persistentEffects: [], loans: 0, goalsClaimed: [], connected: true },
  { playerId: 'p2', name: 'Bob', cash: 30, handSize: 0, hotTipAvailable: true, persistentEffects: [], loans: 0, goalsClaimed: [], connected: true }
];

const auction: AuctionState = {
  cardUid: 'stock-1',
  auctioneerId: 'p2',
  initialBid: 0,
  currentHigh: 2,
  currentHighBidderId: 'p2',
  activeBidders: ['p1'],
  awaitingBidderId: 'p1'
};

describe('AuctionPanel', () => {
  it('shows auction state without bid controls when no auction_bid prompt for me', () => {
    render(<AuctionPanel auction={auction} players={players} myPrompt={null} myPlayerId="p1" />);
    expect(screen.getByText(/Card:/)).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument(); // high bidder
    expect(screen.queryByRole('button', { name: 'Bid' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pass' })).not.toBeInTheDocument();
  });

  it('shows bid/pass controls when myPrompt.type === auction_bid', () => {
    const prompt: PromptEnvelope = {
      promptId: 'pr1',
      type: 'auction_bid',
      playerId: 'p1',
      payload: { currentHigh: 2 },
      message: 'Your bid'
    };
    render(<AuctionPanel auction={auction} players={players} myPrompt={prompt} myPlayerId="p1" />);
    expect(screen.getByRole('button', { name: 'Bid' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Pass' })).toBeEnabled();
  });

  it('calls api.auctionBid({type:"bid", amount}) with the input value', async () => {
    const prompt: PromptEnvelope = {
      promptId: 'pr1',
      type: 'auction_bid',
      playerId: 'p1',
      payload: {},
      message: 'Your bid'
    };
    render(<AuctionPanel auction={auction} players={players} myPrompt={prompt} myPlayerId="p1" />);
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bid' }));
    await waitFor(() =>
      expect(mockedApi.auctionBid).toHaveBeenCalledWith({ type: 'bid', amount: 5 })
    );
  });

  it('calls api.auctionBid({type:"pass"}) on Pass', async () => {
    const prompt: PromptEnvelope = {
      promptId: 'pr1',
      type: 'auction_bid',
      playerId: 'p1',
      payload: {},
      message: 'Your bid'
    };
    render(<AuctionPanel auction={auction} players={players} myPrompt={prompt} myPlayerId="p1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Pass' }));
    await waitFor(() =>
      expect(mockedApi.auctionBid).toHaveBeenCalledWith({ type: 'pass' })
    );
  });

  it('renders awaiting bidder name', () => {
    render(<AuctionPanel auction={auction} players={players} myPrompt={null} myPlayerId="p1" />);
    expect(screen.getByText(/Awaiting:/)).toBeInTheDocument();
    // Alice is awaiting in the fixture
    expect(screen.getByText(/Alice/)).toBeInTheDocument();
  });

  it('defaults the bid input to currentHigh+1 for a normal bidder', () => {
    const prompt: PromptEnvelope = {
      promptId: 'pr1', type: 'auction_bid', playerId: 'p1', payload: {}, message: ''
    };
    render(<AuctionPanel auction={auction} players={players} myPrompt={prompt} myPlayerId="p1" />);
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(input.value).toBe(String(auction.currentHigh + 1));
    expect(input.min).toBe(String(auction.currentHigh + 1));
  });

  it('defaults to currentHigh and allows tie for a Preferred Bidder holder', () => {
    const preferred: ActionCard = {
      uid: 'action-6', category: 'action', id: 6, name: 'Preferred Bidder',
      description: 'tie wins', persistent: true, effect: { type: 'tie_breaker' }
    };
    const playersWithPref: PlayerPublic[] = [
      { ...players[0], persistentEffects: [preferred] },
      players[1]
    ];
    const prompt: PromptEnvelope = {
      promptId: 'pr1', type: 'auction_bid', playerId: 'p1', payload: {}, message: ''
    };
    render(<AuctionPanel auction={auction} players={playersWithPref} myPrompt={prompt} myPlayerId="p1" />);
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(input.value).toBe(String(auction.currentHigh));
    expect(input.min).toBe(String(auction.currentHigh));
    expect(screen.getByText(/Preferred Bidder/)).toBeInTheDocument();
  });

  it('re-defaults the bid input when currentHigh changes (someone else raised)', () => {
    const prompt: PromptEnvelope = {
      promptId: 'pr1', type: 'auction_bid', playerId: 'p1', payload: {}, message: ''
    };
    const { rerender } = render(
      <AuctionPanel auction={auction} players={players} myPrompt={prompt} myPlayerId="p1" />
    );
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(input.value).toBe('3'); // currentHigh=2, default=3

    // Someone else raised to 6.
    const raised: AuctionState = { ...auction, currentHigh: 6, currentHighBidderId: 'p2' };
    rerender(<AuctionPanel auction={raised} players={players} myPrompt={prompt} myPlayerId="p1" />);
    expect(input.value).toBe('7'); // re-default to currentHigh+1
  });
});
