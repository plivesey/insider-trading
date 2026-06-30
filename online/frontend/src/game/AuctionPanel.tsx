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
import { BrassButton } from './theme.js';

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
  const minBid = hasPreferred ? auction.currentHigh : auction.currentHigh + 1;

  const [amount, setAmount] = useState<number>(minBid);
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
    <div className={`turn-plaque${myTurn ? ' turn-plaque--mine' : ''}`}>
      <div className="turn-plaque__head">
        <div className="turn-plaque__title">Auction</div>
      </div>
      <div className="auction-meta">
        <span>Card: <span className="auction-meta__card">{cardLabel}</span></span>
        <span>· High: <span className="auction-meta__amount">${auction.currentHigh}</span></span>
        <span>by <span className="auction-meta__by">{high?.name ?? '?'}</span></span>
      </div>
      <div className="auction-await">Awaiting: {awaiting?.name ?? '(resolving)'}</div>
      {myTurn && (
        <div className="auction-controls">
          <input
            className="deco-input"
            type="number"
            value={amount}
            min={minBid}
            onChange={e => setAmount(parseInt(e.target.value || '0', 10))}
          />
          <BrassButton label="Bid" primary onClick={bid} />
          <BrassButton label="Pass" onClick={pass} />
        </div>
      )}
      {myTurn && hasPreferred && (
        <div className="auction-hint">
          Preferred Bidder: you may tie at ${auction.currentHigh}.
        </div>
      )}
    </div>
  );
}
