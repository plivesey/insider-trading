import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import type { GenerationSettings } from '../lib/types.js';

const SIZES: GenerationSettings['size'][] = ['auto', '1024x1024', '1536x1024', '1024x1536'];
const QUALITIES: GenerationSettings['quality'][] = ['auto', 'low', 'medium', 'high'];
const BACKGROUNDS: GenerationSettings['background'][] = ['auto', 'opaque', 'transparent'];
const OUTPUT_FORMATS: GenerationSettings['outputFormat'][] = ['png', 'jpeg', 'webp'];
const MODERATIONS: GenerationSettings['moderation'][] = ['auto', 'low'];

export function SettingsPage() {
  const [settings, setSettings] = useState<GenerationSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.settings
      .get()
      .then((r) => setSettings(r.settings))
      .catch((e) => setError(e.message));
  }, []);

  function set<K extends keyof GenerationSettings>(key: K, value: GenerationSettings[K]) {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSaved(false);
  }

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const { settings: saved } = await api.settings.patch(settings);
      setSettings(saved);
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (error && !settings) return <p className="error">{error}</p>;
  if (!settings) return <p>Loading…</p>;

  return (
    <div>
      <h1>Settings</h1>
      <p className="hint">
        These apply to every "Generate Image" call for every card — they're shared with your teammate via the synced
        Drive folder, not per-card.
      </p>
      {error && <p className="error">{error}</p>}

      <div className="settings-form">
        <label className="field">
          Size
          <select value={settings.size} onChange={(e) => set('size', e.target.value as GenerationSettings['size'])}>
            {SIZES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          Quality
          <select value={settings.quality} onChange={(e) => set('quality', e.target.value as GenerationSettings['quality'])}>
            {QUALITIES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          Background
          <select
            value={settings.background}
            onChange={(e) => set('background', e.target.value as GenerationSettings['background'])}
          >
            {BACKGROUNDS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          {settings.background === 'transparent' && settings.outputFormat === 'jpeg' && (
            <span className="hint">Transparent background needs png or webp output — jpeg will ignore it.</span>
          )}
        </label>

        <label className="field">
          Output format
          <select
            value={settings.outputFormat}
            onChange={(e) => set('outputFormat', e.target.value as GenerationSettings['outputFormat'])}
          >
            {OUTPUT_FORMATS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>

        {settings.outputFormat !== 'png' && (
          <label className="field">
            Output compression ({settings.outputCompression}%)
            <input
              type="range"
              min={0}
              max={100}
              value={settings.outputCompression}
              onChange={(e) => set('outputCompression', Number(e.target.value))}
            />
            <span className="hint">Only applies to jpeg/webp output.</span>
          </label>
        )}

        <label className="field">
          Moderation
          <select
            value={settings.moderation}
            onChange={(e) => set('moderation', e.target.value as GenerationSettings['moderation'])}
          >
            {MODERATIONS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>

      <button onClick={handleSave} disabled={saving}>
        {saving ? 'Saving…' : 'Save Settings'}
      </button>
      {saved && !saving && <span className="hint"> Saved.</span>}
    </div>
  );
}
