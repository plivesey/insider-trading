import { useState } from 'react';
import type { Color, ProjectedGameState, PromptEnvelope } from '@insider-trading/shared';
import { api } from '../lib/api.js';
import { showError } from '../lib/toast.js';

const COLORS: Color[] = ['Blue', 'Orange', 'Yellow', 'Purple'];

interface Props {
  prompt: PromptEnvelope;
  state: ProjectedGameState;
}

export function PromptModal({ prompt, state }: Props) {
  const [draft, setDraft] = useState<any>({});

  async function send(response: Record<string, unknown>) {
    try {
      await api.promptResponse({ promptId: prompt.promptId, response });
    } catch (e) {
      showError((e as Error).message);
    }
  }

  function renderBody() {
    switch (prompt.type) {
      case 'peek_ack':
        return (
          <>
            {(prompt.payload?.tip as any) && (
              <div>Top tip: <strong>{(prompt.payload.tip as any).text}</strong></div>
            )}
            {(prompt.payload?.tips as any) && (
              <ul>
                {(prompt.payload.tips as any[]).map((t, i) => (
                  <li key={i}>{t.text}</li>
                ))}
              </ul>
            )}
            <button onClick={() => send({})}>OK</button>
          </>
        );
      case 'pick_color': {
        const exclude = prompt.payload?.exclude as Color | undefined;
        return (
          <div>
            {COLORS.filter(c => c !== exclude).map(c => (
              <button key={c} onClick={() => send({ color: c })}>{c}</button>
            ))}
          </div>
        );
      }
      case 'pick_color_amount': {
        const amount = prompt.payload?.amount as number;
        const perColor = prompt.payload?.perColor as boolean | undefined;
        if (perColor) {
          return (
            <div>
              {COLORS.map(c => (
                <div key={c} style={{ marginBottom: 4 }}>
                  {c}:{' '}
                  <button onClick={() => setDraft({ ...draft, [c]: amount })}>+{amount}</button>
                  <button onClick={() => setDraft({ ...draft, [c]: -amount })}>-{amount}</button>
                  {draft[c] !== undefined && <span> [{draft[c] > 0 ? '+' : ''}{draft[c]}]</span>}
                </div>
              ))}
              <button
                onClick={() => send({ choices: draft })}
                disabled={COLORS.some(c => draft[c] === undefined)}
              >
                Submit
              </button>
            </div>
          );
        }
        return (
          <div>
            Color: <select onChange={e => setDraft({ ...draft, color: e.target.value })}>
              <option value="">--</option>
              {COLORS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>{' '}
            Sign: <button onClick={() => setDraft({ ...draft, sign: 'up' })}>+{amount}</button>
            <button onClick={() => setDraft({ ...draft, sign: 'down' })}>-{amount}</button>
            {draft.sign && <span> [{draft.sign}]</span>}
            <div><button onClick={() => send(draft)} disabled={!draft.color || !draft.sign}>Submit</button></div>
          </div>
        );
      }
      case 'set_stock_choice':
        return (
          <div>
            {COLORS.map(c => (
              <button key={c} onClick={() => send({ color: c })}>Set {c} to ${String(prompt.payload?.amount ?? '')}</button>
            ))}
          </div>
        );
      case 'adjust_two_stocks_choice':
        return (
          <div>
            Raise:{' '}
            <select onChange={e => setDraft({ ...draft, upColor: e.target.value })}>
              <option value="">--</option>{COLORS.map(c => <option key={c}>{c}</option>)}
            </select>{' '}
            Lower:{' '}
            <select onChange={e => setDraft({ ...draft, downColor: e.target.value })}>
              <option value="">--</option>{COLORS.map(c => <option key={c}>{c}</option>)}
            </select>
            <button onClick={() => send(draft)} disabled={!draft.upColor || !draft.downColor}>Submit</button>
          </div>
        );
      case 'wild_speculation_choice':
        return (
          <div>
            {(prompt.payload?.color as string)} ±{prompt.payload?.amount as number}:{' '}
            <button onClick={() => send({ sign: 'up' })}>Raise</button>
            <button onClick={() => send({ sign: 'down' })}>Lower</button>
          </div>
        );
      case 'draw_and_keep': {
        const drawn = prompt.payload?.drawn as { uid: string; summary: string }[];
        const keepCount = prompt.payload?.keepCount as number;
        const kept = (draft.keepUids as string[]) ?? [];
        function toggle(uid: string) {
          if (kept.includes(uid)) setDraft({ keepUids: kept.filter(u => u !== uid) });
          else if (kept.length < keepCount) setDraft({ keepUids: [...kept, uid] });
        }
        return (
          <div>
            Pick {keepCount}:
            <ul>
              {drawn.map(d => (
                <li key={d.uid}>
                  <button onClick={() => toggle(d.uid)}>{kept.includes(d.uid) ? '✓ ' : ''}{d.summary}</button>
                </li>
              ))}
            </ul>
            <button onClick={() => send({ keepUids: kept })} disabled={kept.length !== keepCount}>Submit</button>
          </div>
        );
      }
      case 'reorder_tips': {
        const tips = prompt.payload?.tips as { uid: string; text: string }[];
        const order = (draft.order as string[]) ?? tips.map(t => t.uid);
        function move(uid: string, dir: -1 | 1) {
          const i = order.indexOf(uid);
          const j = i + dir;
          if (j < 0 || j >= order.length) return;
          const next = [...order];
          [next[i], next[j]] = [next[j], next[i]];
          setDraft({ order: next });
        }
        return (
          <div>
            <ol>
              {order.map(uid => {
                const t = tips.find(x => x.uid === uid)!;
                return (
                  <li key={uid}>
                    {t.text}{' '}
                    <button onClick={() => move(uid, -1)}>↑</button>
                    <button onClick={() => move(uid, 1)}>↓</button>
                  </li>
                );
              })}
            </ol>
            <button onClick={() => send({ order })}>Submit</button>
          </div>
        );
      }
      case 'pick_target_player':
        return (
          <div>
            {state.players
              .filter(p => p.playerId !== state.myPlayer?.playerId)
              .map(p => (
                <button key={p.playerId} onClick={() => send({ targetId: p.playerId })}>{p.name}</button>
              ))}
          </div>
        );
      case 'pick_stock_from_target': {
        const stocks = prompt.payload?.stocks as { uid: string; color: string; name?: string }[];
        return (
          <div>
            {stocks.map(s => (
              <button key={s.uid} onClick={() => send({ stockUid: s.uid })}>{s.color}{s.name ? ` ${s.name}` : ''}</button>
            ))}
          </div>
        );
      }
      case 'pick_market_card':
        return (
          <div>
            {state.market.map(c => (
              <button key={c.uid} onClick={() => send({ cardUid: c.uid })}>
                {c.category === 'stock' ? `${c.color}${c.name ? ' ' + c.name : ''}` : `Action: ${c.name}`}
              </button>
            ))}
          </div>
        );
      case 'pick_hand_stock_for_swap':
      case 'pick_stock_from_hand': {
        const my = state.myPlayer;
        if (!my) return null;
        const eligible = my.hand.filter(c => c.category === 'stock' && c.color !== 'Wild');
        const mode = (prompt.payload?.mode as string) ?? '';
        return (
          <div>
            {eligible.map(c => (
              <button key={c.uid} onClick={() => send({ stockUid: c.uid })}>{(c as any).color}</button>
            ))}
            {mode === 'sell_bonus_batch' && <button onClick={() => send({ done: true })}>Done</button>}
          </div>
        );
      }
      default:
        return <div>Unhandled prompt type: {prompt.type}</div>;
    }
  }

  return (
    <>
      <div className="overlay" />
      <div className="prompt-modal">
        <h3>{prompt.message}</h3>
        {renderBody()}
      </div>
    </>
  );
}
