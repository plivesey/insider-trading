import { useEffect, useState } from 'react';
import { api } from './lib/api.js';
import { useGameState } from './hooks/useGameState.js';
import { Lobby } from './pages/Lobby.js';
import { GameInProgressBlock } from './pages/GameInProgressBlock.js';
import { GameBoard } from './game/GameBoard.js';
import { ToastRack } from './components/ToastRack.js';

export function App() {
  const { state, log, connected } = useGameState();
  const [myName, setMyName] = useState<string | null>(null);

  useEffect(() => {
    api.me().then(r => setMyName(r.name)).catch(() => {});
  }, [state?.mode]);

  if (!state) {
    return (
      <div className="loading">
        <p>Connecting…</p>
      </div>
    );
  }

  return (
    <div className="app">
      <div className={`conn-indicator ${connected ? '' : 'disconnected'}`}>
        {connected ? '● live' : '○ reconnecting…'}
      </div>
      {state.mode === 'lobby' && <Lobby state={state} myName={myName} />}
      {state.mode === 'game_in_progress_spectator' && <GameInProgressBlock />}
      {(state.mode === 'in_game' || state.mode === 'game_over') && (
        <GameBoard state={state.state} log={log} mode={state.mode} />
      )}
      <ToastRack />
    </div>
  );
}
