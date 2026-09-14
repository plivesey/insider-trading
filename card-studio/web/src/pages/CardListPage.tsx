import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import type { CardSummary } from '../lib/types.js';
import { GenerationSettingsSummary } from '../settings/GenerationSettingsSummary.js';

export function CardListPage() {
  const [cards, setCards] = useState<CardSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api.cards
      .list()
      .then((r) => setCards(r.cards))
      .catch((e) => setError(e.message));
  }, []);

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const { card } = await api.cards.create();
      navigate(`/cards/${card.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Cards</h1>
        <button onClick={handleCreate} disabled={creating}>
          {creating ? 'Creating…' : '+ New Card'}
        </button>
      </div>
      <GenerationSettingsSummary />
      {error && <p className="error">{error}</p>}
      {!cards && !error && <p>Loading…</p>}
      {cards && cards.length === 0 && <p>No cards yet — create one to get started.</p>}
      <div className="card-grid">
        {cards?.map((c) => (
          <a key={c.id} className="card-tile" href={`#/cards/${c.id}`}>
            <div className="card-tile-name">{c.name}</div>
            <div className="card-tile-prompt">{c.prompt || <em>no prompt yet</em>}</div>
            <div className="card-tile-meta">
              {c.generationCount} generation{c.generationCount === 1 ? '' : 's'}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
