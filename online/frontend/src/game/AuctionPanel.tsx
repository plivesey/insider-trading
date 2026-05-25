import { useEffect, useState } from 'react';
import type {
  AuctionState,
  PlayerPublic,
  PromptEnvelope,
  StockCard,
  ActionCard
} from '@insider-trading/shared';
import { api } from '../lib/api.js';
import { showError } from '../lib/toast.js';
import { describeCard } from './cardLabel.js';

interface Props {
  auction: AuctionState;
  players: PlayerPublic[];
  myPrompt: PromptEnvelope | null;
  myPlayerId: string;
  market: (StockCard | ActionCard)[];
}

export function AuctionPanel({ auction, players, myPrompt, myPlayerId, market }: Props) {
  const auctionedCard = market.find(c => c.uid === auction.cardUid);
  const cardLabel = auctionedCard
    ? describeCard(auctionedCard as any).title
    : auction.cardUid;
  const me = players.find(p => p.playerId === myPlayerId);
  const hasPreferred = !!me?.persistentEffects.some(e => e.effect.type === 'tie_breaker');
  // Lowest legal bid: currentHigh if Preferred Bidder (can tie), else currentHigh + 1.
  const minBid = hasPreferred ? auction.currentHigh : auction.currentHigh + 1;

  const [amount, setAmount] = useState<number>(minBid);
  // Re-default to the lowest legal bid whenever currentHigh changes (e.g. another
  // player just raised). This avoids carrying a stale value into the next prompt.
  useEffect(() => {
    setAmount(minBid);
  }, [auction.currentHigh, hasPreferred]);

  const high = players.find(p => p.playerId === auction.currentHighBidderId);
  const awaiting = players.find(p => p.playerId === auction.awaitingBidderId);
  const myTurn = myPrompt?.type === 'auction_bid';

  async function bid() {
    try {
      await api.auctionBid({ type: 'bid', amount });
    } catch (e) {
      showError((e as Error).message);
    }
  }
  async function pass() {
    try {
      await api.auctionBid({ type: 'pass' });
    } catch (e) {
      showError((e as Error).message);
    }
  }

  return (
    <div className="panel">
      <h3>Auction</h3>
      <div>
        Card: <strong>{cardLabel}</strong> · High: <strong>${auction.currentHigh}</strong> by{' '}
        <strong>{high?.name ?? '?'}</strong>
      </div>
      <div>Awaiting: {awaiting?.name ?? '(resolving)'}</div>
      {myTurn && (
        <div style={{ marginTop: 8 }}>
          <input
            type="number"
            value={amount}
            min={minBid}
            onChange={e => setAmount(parseInt(e.target.value || '0', 10))}
          />
          <button onClick={bid}>Bid</button>
          <button onClick={pass}>Pass</button>
          {hasPreferred && (
            <div style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>
              Preferred Bidder: you may tie at ${auction.currentHigh}.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
