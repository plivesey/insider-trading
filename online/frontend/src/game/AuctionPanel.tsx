import { useState } from 'react';
import type { AuctionState, PlayerPublic, PromptEnvelope } from '@insider-trading/shared';
import { api } from '../lib/api.js';
import { showError } from '../lib/toast.js';

interface Props {
  auction: AuctionState;
  players: PlayerPublic[];
  myPrompt: PromptEnvelope | null;
  myPlayerId: string;
}

export function AuctionPanel({ auction, players, myPrompt, myPlayerId }: Props) {
  const [amount, setAmount] = useState<number>(auction.currentHigh + 1);

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
        Card: <strong>{auction.cardUid}</strong> · High: <strong>${auction.currentHigh}</strong> by{' '}
        <strong>{high?.name ?? '?'}</strong>
      </div>
      <div>Awaiting: {awaiting?.name ?? '(resolving)'}</div>
      {myTurn && (
        <div style={{ marginTop: 8 }}>
          <input
            type="number"
            value={amount}
            min={auction.currentHigh + 1}
            onChange={e => setAmount(parseInt(e.target.value || '0', 10))}
          />
          <button onClick={bid}>Bid</button>
          <button onClick={pass}>Pass</button>
        </div>
      )}
    </div>
  );
}
