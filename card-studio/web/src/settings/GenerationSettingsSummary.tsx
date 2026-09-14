import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import type { GenerationSettings } from '../lib/types.js';

// Read-only display of the shared generation defaults — every "Generate
// Image" call across every card uses these. Edited on the Settings page.
export function GenerationSettingsSummary() {
  const [settings, setSettings] = useState<GenerationSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.settings
      .get()
      .then((r) => setSettings(r.settings))
      .catch((e) => setError(e.message));
  }, []);

  if (error) return null;
  if (!settings) return null;

  const rows: [string, string][] = [
    ['Size', settings.size],
    ['Quality', settings.quality],
    ['Background', settings.background],
    ['Format', settings.outputFormat],
    ...(settings.outputFormat !== 'png' ? ([['Compression', `${settings.outputCompression}%`]] as [string, string][]) : []),
    ['Moderation', settings.moderation]
  ];

  return (
    <div className="generation-settings-summary">
      <span className="generation-settings-summary-label">Generating with:</span>
      {rows.map(([label, value]) => (
        <span key={label} className="generation-settings-chip">
          {label}: {value}
        </span>
      ))}
      <a href="#/settings" className="generation-settings-summary-edit">
        Edit
      </a>
    </div>
  );
}
