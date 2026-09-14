// Client-side id for new text overlays before they've been saved — the
// server accepts and keeps any non-empty string id from the client.
export function newLocalId(): string {
  return crypto.randomUUID();
}
