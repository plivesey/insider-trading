/**
 * Minimal toast system. Anywhere we caught an error and called alert(),
 * call showError(message) instead. The App mounts <ToastRack /> at the
 * root and listens for these events.
 */
type Listener = (msg: string) => void;
const listeners = new Set<Listener>();

export function showError(message: string): void {
  for (const l of listeners) l(message);
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
