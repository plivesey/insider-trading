import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useDebouncedEffect } from '../lib/useDebouncedEffect.js';
import type { Card, Template } from '../lib/types.js';
import { TextValuesEditor } from '../editor/TextValuesEditor.js';
import { CardPreview } from '../editor/CardPreview.js';
import { PromptPanel } from '../editor/PromptPanel.js';
import { GenerationHistory } from '../editor/GenerationHistory.js';
import { DownloadButton } from '../editor/DownloadButton.js';

export function CardEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [card, setCard] = useState<Card | null>(null);
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.cards
      .get(id)
      .then((r) => setCard(r.card))
      .catch((e) => setError(e.message));
    api.templates
      .list()
      .then((r) => setTemplates(r.templates))
      .catch((e) => setError(e.message));
  }, [id]);

  useDebouncedEffect(() => {
    if (!card) return;
    api.cards
      .patch(card.id, {
        name: card.name,
        prompt: card.prompt,
        templateId: card.templateId,
        textValues: card.textValues
      })
      .catch((e) => setError(e.message));
  }, [card?.name, card?.prompt, card?.templateId, card?.textValues]);

  if (error) return <p className="error">{error}</p>;
  if (!card) return <p>Loading…</p>;

  const template = templates?.find((t) => t.id === card.templateId) ?? null;
  const selectedGeneration =
    card.generations.find((g) => g.id === card.selectedGenerationId) ?? null;
  const artImageUrl = selectedGeneration
    ? api.cards.generationImageUrl(card.id, selectedGeneration.id)
    : null;

  return (
    <div className="card-editor-layout">
      <div className="card-editor">
        <input
          className="card-name"
          value={card.name}
          onChange={(e) => setCard({ ...card, name: e.target.value })}
        />

        <label className="field">
          Template
          <select
            value={card.templateId ?? ''}
            onChange={(e) => setCard({ ...card, templateId: e.target.value || null })}
          >
            <option value="">— none —</option>
            {templates?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        {!template && card.templateId && <p className="hint">Selected template not found.</p>}

        <PromptPanel
          card={card}
          onPromptChange={(prompt) => setCard({ ...card, prompt })}
          onCardUpdate={setCard}
        />

        <h3>Generations</h3>
        <GenerationHistory card={card} onCardUpdate={setCard} />

        <h3>Text</h3>
        <TextValuesEditor
          template={template}
          textValues={card.textValues}
          onChange={(textValues) => setCard({ ...card, textValues })}
        />
      </div>
      <div className="card-editor-preview-col">
        <CardPreview template={template} artImageUrl={artImageUrl} textValues={card.textValues} />
        <DownloadButton template={template} artImageUrl={artImageUrl} textValues={card.textValues} />
      </div>
    </div>
  );
}
