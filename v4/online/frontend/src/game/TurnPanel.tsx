import { useEffect, useState } from 'react';
import type { Color, ProjectedGameState, StockCard } from '@insider-trading/shared';
import { api } from '../lib/api.js';
import { showError } from '../lib/toast.js';
import { describeCard } from './cardLabel.js';
import { BrassButton, INDUSTRY } from './theme.js';

interface Props {
  state: ProjectedGameState;
  myPlayerId: string;
  pickedCardUid?: string | null;
  onClearPick?: () => void;
}

type Mode = null | 'auction' | 'sell';

export function TurnPanel({ state, myPlayerId, pickedCardUid, onClearPick }: Props) {
  const isMyTurn = state.players[state.currentPlayerIndex]?.playerId === myPlayerId;
  const currentName = state.players[state.currentPlayerIndex]?.name ?? '—';
  const [mode, setMode] = useState<Mode>(null);
  const [selectedMarket, setSelectedMarket] = useState<string>(state.market[0]?.uid ?? '');
  const [bid, setBid] = useState<number>(0);
  const [sellUid, setSellUid] = useState<string>('');

  // When the user clicks a market card, snap into auction mode with that card
  // selected — even if they were already in sell mode.
  useEffect(() => {
    if (pickedCardUid && state.market.some(c => c.uid === pickedCardUid)) {
      setMode('auction');
      setSelectedMarket(pickedCardUid);
    }
  }, [pickedCardUid, state.market]);

  if (state.auction) return null;
  if (state.myPrompt) return null;

  const sellableStocks =
    state.myPlayer?.hand.filter(c => c.category === 'stock' && c.color !== 'Wild') ?? [];

  async function startAuction() {
    if (!selectedMarket) return;
    try {
      await api.turnAction({ type: 'start_auction', cardUid: selectedMarket, initialBid: bid });
      setMode(null);
      onClearPick?.();
    } catch (e) {
      showError((e as Error).message);
    }
  }

  async function sell() {
    if (!sellUid) return;
    try {
      await api.turnAction({ type: 'sell_stock', stockUid: sellUid });
      setMode(null);
    } catch (e) {
      showError((e as Error).message);
    }
  }

  if (!isMyTurn) {
    return (
      <div className="turn-plaque">
        <div className="turn-plaque__head">
          <div className="turn-plaque__title">{currentName}'s Turn</div>
          <div className="turn-plaque__phase">Phase I · Main</div>
        </div>
        <div className="turn-plaque__copy turn-plaque__copy--wait">
          Waiting on {currentName} to choose an action.
          <div className="turn-plaque__hint">
            You can still <b>play action cards</b> from your hand or <b>claim goals</b> at any time.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="turn-plaque turn-plaque--mine">
      <div className="turn-plaque__head">
        <div className="turn-plaque__title">Your Turn</div>
        <div className="turn-plaque__phase">Phase I · Main</div>
      </div>
      <div className="turn-plaque__copy">
        Two actions available on your turn: put a market card up for <em>Auction</em>, or <em>Sell</em> a stock from your hand.
      </div>
      <div className="turn-actions">
        <BrassButton
          label="Auction"
          primary={mode !== 'sell'}
          onClick={() => {
            const next = mode === 'auction' ? null : 'auction';
            setMode(next);
            if (next !== 'auction') onClearPick?.();
          }}
        />
        <BrassButton
          label="Sell"
          primary={mode === 'sell'}
          onClick={() => {
            setMode(mode === 'sell' ? null : 'sell');
            onClearPick?.();
          }}
        />
      </div>
      {mode === 'auction' && (
        <div className="turn-action-row">
          <span className="turn-action-row__label">Card</span>
          <select
            className="deco-select"
            value={selectedMarket}
            onChange={e => setSelectedMarket(e.target.value)}
          >
            {state.market.map(c => (
              <option key={c.uid} value={c.uid}>
                {describeCard(c).title}
              </option>
            ))}
          </select>
          <span className="turn-action-row__label">@ $</span>
          <input
            className="deco-input"
            type="number"
            min={0}
            value={bid}
            onChange={e => setBid(parseInt(e.target.value || '0', 10))}
            style={{ width: 80 }}
          />
          <BrassButton label="Start" primary onClick={startAuction} />
        </div>
      )}
      {mode === 'sell' && (
        <div className="turn-action-row">
          <span className="turn-action-row__label">Stock</span>
          <select
            className="deco-select"
            value={sellUid}
            onChange={e => setSellUid(e.target.value)}
          >
            <option value="">(pick one)</option>
            {sellableStocks.map(c => {
              const sc = c as StockCard;
              const color = sc.color as Color;
              return (
                <option key={c.uid} value={c.uid}>
                  {INDUSTRY[color].label}{sc.name ? ` ${sc.name}` : ''} for ${state.stockPrices[color]}
                </option>
              );
            })}
          </select>
          <BrassButton label="Sell" primary disabled={!sellUid} onClick={sell} />
        </div>
      )}
    </div>
  );
}
