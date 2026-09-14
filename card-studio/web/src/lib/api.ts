import type { Card, CardSummary, GenerationSettings, Template, TextOverlay, Box } from './types.js';

async function parseResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
  return body as T;
}

function callJson<T>(path: string, init?: RequestInit): Promise<T> {
  return fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init
  }).then(parseResponse<T>);
}

function callRaw<T>(path: string, init?: RequestInit): Promise<T> {
  return fetch(`/api${path}`, init).then(parseResponse<T>);
}

export const api = {
  templates: {
    list: () => callJson<{ templates: Template[] }>('/templates'),
    get: (id: string) => callJson<{ template: Template }>(`/templates/${id}`),
    upload: (file: File, name: string) => {
      const form = new FormData();
      form.append('file', file);
      form.append('name', name);
      return callRaw<{ template: Template }>('/templates', { method: 'POST', body: form });
    },
    patch: (id: string, body: Partial<{ name: string; artPlacement: Box; textOverlays: TextOverlay[] }>) =>
      callJson<{ template: Template }>(`/templates/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body)
      }),
    delete: (id: string, force = false) =>
      callJson<{ ok: true }>(`/templates/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' }),
    // `version` should be the template's imageUpdatedAt — it changes the URL
    // whenever the PNG's on-disk mtime changes, forcing a real re-fetch
    // instead of the browser reusing whatever it last cached for this id.
    imageUrl: (id: string, version?: string) =>
      `/api/templates/${id}/image${version ? `?v=${encodeURIComponent(version)}` : ''}`
  },
  cards: {
    list: () => callJson<{ cards: CardSummary[] }>('/cards'),
    create: (name?: string) =>
      callJson<{ card: Card }>('/cards', { method: 'POST', body: JSON.stringify({ name }) }),
    get: (id: string) => callJson<{ card: Card }>(`/cards/${id}`),
    patch: (
      id: string,
      body: Partial<{
        name: string;
        prompt: string;
        templateId: string | null;
        textValues: Record<string, string>;
      }>
    ) => callJson<{ card: Card }>(`/cards/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: string) => callJson<{ ok: true }>(`/cards/${id}`, { method: 'DELETE' }),
    // Generation parameters (size, quality, etc.) aren't passed here — they
    // come from the shared GenerationSettings the server reads for every
    // call. See the Settings page.
    generate: (id: string, prompt: string) =>
      callJson<{ card: Card; generation: Card['generations'][number] }>(`/cards/${id}/generate`, {
        method: 'POST',
        body: JSON.stringify({ prompt })
      }),
    selectGeneration: (id: string, generationId: string) =>
      callJson<{ card: Card }>(`/cards/${id}/select-generation`, {
        method: 'POST',
        body: JSON.stringify({ generationId })
      }),
    generationImageUrl: (cardId: string, generationId: string) =>
      `/api/cards/${cardId}/generations/${generationId}/image`
  },
  settings: {
    get: () => callJson<{ settings: GenerationSettings }>('/settings'),
    patch: (body: Partial<GenerationSettings>) =>
      callJson<{ settings: GenerationSettings }>('/settings', { method: 'PATCH', body: JSON.stringify(body) })
  }
};
