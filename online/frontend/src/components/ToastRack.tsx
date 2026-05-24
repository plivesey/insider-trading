import { useEffect, useState } from 'react';
import { subscribe } from '../lib/toast.js';

interface Toast {
  id: number;
  message: string;
}

export function ToastRack() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => {
    let id = 0;
    return subscribe(message => {
      const t: Toast = { id: ++id, message };
      setToasts(prev => [...prev, t]);
      setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 5000);
    });
  }, []);
  if (toasts.length === 0) return null;
  return (
    <div className="toast-rack">
      {toasts.map(t => (
        <div key={t.id} className="toast" role="alert">
          {t.message}
        </div>
      ))}
    </div>
  );
}
