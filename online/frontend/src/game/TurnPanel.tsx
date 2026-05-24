import { useState } from 'react';
import type { Color, ProjectedGameState, StockCard } from '@insider-trading/shared';
import { api } from '../lib/api.js';
import { showError } from '../lib/toast.js';

interface Props {
  state: ProjectedGameState;
  myPlayerId: string;
}

export function TurnPanel({ state, myPlayerId }: Props) {
  const isMyTurn = state.players[state.currentPlayerIndex]?.playerId === myPlayerId;
  const [selectedMarket, setSelectedMarket] = useState<string>(state.market[0]?.uid ?? '');
  const [bid, setBid] = useState<number>(0);
  const [sellUid, setSellUid] = useState<string>('');

  if (!isMyTurn) return <div className="panel">Waiting for {state.players[state.currentPlayerIndex]?.name}…</div>;
  const panelClass = 'panel your-turn';
  if (state.auction) return null;
  if (state.myPrompt) return null;

  const sellableStocks = state.myPlayer?.hand.filter(c => c.category === 'stock' && c.color !== 'Wild') ?? [];

  async function startAuction() {
    if (!selectedMarket) return;
    try {
      await api.turnAction({ type: 'start_auction', cardUid: selectedMarket, initialBid: bid });
    } catch (e) {
      showError((e as Error).message);
    }
  }
  async function sell() {
    if (!sellUid) return;
    try {
      await api.turnAction({ type: 'sell_stock', stockUid: sellUid });
    } catch (e) {
      showError((e as Error).message);
    }
  }

  return (
    <div className={panelClass}>
      <h3>Your Turn</h3>
      <div style={{ marginBottom: 8 }}>
        <strong>Start auction:</strong>{' '}
        <select value={selectedMarket} onChange={e => setSelectedMarket(e.target.value)}>
          {state.market.map(c => (
            <option key={c.uid} value={c.uid}>
              {c.category === 'stock' ? `${c.color}${c.name ? ' ' + c.name : ''}` : `Action: ${c.name}`}
            </option>
          ))}
        </select>{' '}
        @ $<input type="number" min={0} value={bid} onChange={e => setBid(parseInt(e.target.value || '0', 10))} style={{ width: 60 }} />
        <button onClick={startAuction}>Start</button>
      </div>
      <div>
        <strong>Or sell a stock:</strong>{' '}
        <select value={sellUid} onChange={e => setSellUid(e.target.value)}>
          <option value="">(pick one)</option>
          {sellableStocks.map(c => {
            const sc = c as StockCard;
            const color = sc.color as Color;
            return (
              <option key={c.uid} value={c.uid}>
                {color} for ${state.stockPrices[color]}
              </option>
            );
          })}
        </select>
        <button onClick={sell} disabled={!sellUid}>Sell</button>
      </div>
    </div>
  );
}
