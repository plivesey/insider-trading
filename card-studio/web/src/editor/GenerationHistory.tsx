import { useState } from 'react';
import { api } from '../lib/api.js';
import type { Card } from '../lib/types.js';

export function GenerationHistory({
  card,
  onCardUpdate
}: {
  card: Card;
  onCardUpdate: (card: Card) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  async function select(generationId: string) {
    try {
      const { card: updated } = await api.cards.selectGeneration(card.id, generationId);
      onCardUpdate(updated);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (card.generations.length === 0) {
    return <p className="hint">No generations yet — write a prompt and click Generate Image.</p>;
  }

  return (
    <div className="generation-history">
      {error && <p className="error">{error}</p>}
      <div className="generation-strip">
        {[...card.generations].reverse().map((g) => (
          <button
            key={g.id}
            className={`generation-thumb ${g.id === card.selectedGenerationId ? 'selected' : ''}`}
            onClick={() => select(g.id)}
            title={g.prompt}
          >
            <img src={api.cards.generationImageUrl(card.id, g.id)} alt={g.prompt} />
          </button>
        ))}
      </div>
    </div>
  );
}
