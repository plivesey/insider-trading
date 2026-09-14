import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import type { Template } from '../lib/types.js';
import { ArtPlacementControls } from '../templates/ArtPlacementControls.js';
import { TextOverlayControls } from '../templates/TextOverlayControls.js';
import { TemplatePreview } from '../templates/TemplatePreview.js';

export function TemplateManagerPage() {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function refresh() {
    return api.templates
      .list()
      .then((r) => setTemplates(r.templates))
      .catch((e) => setError(e.message));
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const { template } = await api.templates.upload(file, name || file.name);
      setName('');
      setFile(null);
      await refresh();
      setSelectedId(template.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this template?')) return;
    try {
      await api.templates.delete(id);
      if (selectedId === id) setSelectedId(null);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const selected = templates?.find((t) => t.id === selectedId) ?? null;

  return (
    <div>
      <h1>Templates</h1>
      {error && <p className="error">{error}</p>}

      <form className="upload-form" onSubmit={handleUpload}>
        <input
          type="file"
          accept="image/png"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <input
          type="text"
          placeholder="Template name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" disabled={!file || uploading}>
          {uploading ? 'Uploading…' : 'Upload Template'}
        </button>
      </form>

      <div className="template-grid">
        {templates?.map((t) => (
          <button
            key={t.id}
            className={`template-tile ${t.id === selectedId ? 'selected' : ''}`}
            onClick={() => setSelectedId(t.id)}
          >
            <img src={api.templates.imageUrl(t.id, t.imageUpdatedAt)} alt={t.name} />
            <div>{t.name}</div>
            <div className="hint">
              {t.width}×{t.height}
            </div>
          </button>
        ))}
      </div>

      {selected && (
        <div className="template-detail">
          <div className="page-header">
            <input
              className="template-name-field"
              value={selected.name}
              onChange={(e) => {
                const name = e.target.value;
                setTemplates((prev) => prev?.map((x) => (x.id === selected.id ? { ...x, name } : x)) ?? prev);
              }}
              onBlur={() =>
                api.templates.patch(selected.id, { name: selected.name }).catch((e) => setError((e as Error).message))
              }
            />
            <button className="danger" onClick={() => handleDelete(selected.id)}>
              Delete
            </button>
          </div>
          <p className="hint">Renaming also renames the template's files on disk.</p>
          <TemplatePreview template={selected} />
          <h3>Art placement</h3>
          <ArtPlacementControls
            template={selected}
            onChange={(t) =>
              setTemplates((prev) => prev?.map((x) => (x.id === t.id ? t : x)) ?? prev)
            }
          />
          <h3>Text overlays</h3>
          <TextOverlayControls
            template={selected}
            onChange={(t) =>
              setTemplates((prev) => prev?.map((x) => (x.id === t.id ? t : x)) ?? prev)
            }
          />
        </div>
      )}
    </div>
  );
}
