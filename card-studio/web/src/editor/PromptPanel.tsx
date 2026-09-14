import { useState } from 'react';
import { api } from '../lib/api.js';
import type { Card } from '../lib/types.js';

export function PromptPanel({
  card,
  onPromptChange,
  onCardUpdate
}: {
  card: Card;
  onPromptChange: (prompt: string) => void;
  onCardUpdate: (card: Card) => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    if (!card.prompt.trim()) {
      setError('Write a prompt first');
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const { card: updated } = await api.cards.generate(card.id, card.prompt);
      onCardUpdate(updated);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="prompt-panel">
      <label className="field">
        Prompt
        <textarea
          rows={4}
          value={card.prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="e.g. 1920s steel factory, art deco poster style, dramatic lighting"
        />
      </label>
      <button onClick={handleGenerate} disabled={generating}>
        {generating ? 'Generating… (can take up to a minute)' : 'Generate Image'}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
