import { useState } from 'react';
import type { Color, ProjectedGameState, PromptEnvelope } from '@insider-trading/shared';
import { api } from '../lib/api.js';
import { showError } from '../lib/toast.js';
import { describeCard } from './cardLabel.js';
import { BrassButton, C, DecoCorner, INDUSTRY, INDUSTRY_ORDER, relabelColors } from './theme.js';

const COLORS: Color[] = INDUSTRY_ORDER;

interface Props {
  prompt: PromptEnvelope;
  state: ProjectedGameState;
}

function ColorButton({
  color,
  onClick,
  label
}: {
  color: Color;
  onClick: () => void;
  label?: string;
}) {
  const meta = INDUSTRY[color];
  return (
    <BrassButton label={label ?? meta.label} onClick={onClick} />
  );
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
              <div className="deco-modal__success">
                Top tip: <strong>{relabelColors((prompt.payload.tip as any).text)}</strong>
              </div>
            )}
            {(prompt.payload?.tips as any) && (
              <ul>
                {(prompt.payload.tips as any[]).map((t, i) => (
                  <li key={i}>{relabelColors(t.text)}</li>
                ))}
              </ul>
            )}
            <div className="deco-modal__footer">
              <BrassButton label="OK" primary onClick={() => send({})} />
            </div>
          </>
        );
      case 'pick_color': {
        const exclude = prompt.payload?.exclude as Color | undefined;
        return (
          <div className="deco-modal__row">
            {COLORS.filter(c => c !== exclude).map(c => (
              <ColorButton key={c} color={c} onClick={() => send({ color: c })} />
            ))}
          </div>
        );
      }
      case 'pick_color_amount': {
        const amount = prompt.payload?.amount as number;
        const perColor = prompt.payload?.perColor as boolean | undefined;
        if (perColor) {
          return (
            <>
              {COLORS.map(c => (
                <div key={c} className="deco-modal__row">
                  <span style={{ width: 70 }}>{INDUSTRY[c].label}:</span>
                  <BrassButton label={`+${amount}`} onClick={() => setDraft({ ...draft, [c]: amount })} />
                  <BrassButton label={`−${amount}`} onClick={() => setDraft({ ...draft, [c]: -amount })} />
                  {draft[c] !== undefined && (
                    <span style={{ color: C.brass }}>[{draft[c] > 0 ? '+' : ''}{draft[c]}]</span>
                  )}
                </div>
              ))}
              <div className="deco-modal__footer">
                <BrassButton
                  label="Submit"
                  primary
                  onClick={() => send({ choices: draft })}
                  disabled={COLORS.some(c => draft[c] === undefined)}
                />
              </div>
            </>
          );
        }
        return (
          <>
            <div className="deco-modal__row">
              <span>Industry:</span>
              <select
                className="deco-select"
                onChange={e => setDraft({ ...draft, color: e.target.value })}
                value={draft.color ?? ''}
              >
                <option value="">--</option>
                {COLORS.map(c => <option key={c} value={c}>{INDUSTRY[c].label}</option>)}
              </select>
              <BrassButton label={`+${amount}`} onClick={() => setDraft({ ...draft, sign: 'up' })} />
              <BrassButton label={`−${amount}`} onClick={() => setDraft({ ...draft, sign: 'down' })} />
              {draft.sign && <span style={{ color: C.brass }}>[{draft.sign}]</span>}
            </div>
            <div className="deco-modal__footer">
              <BrassButton
                label="Submit"
                primary
                onClick={() => send(draft)}
                disabled={!draft.color || !draft.sign}
              />
            </div>
          </>
        );
      }
      case 'set_stock_choice':
        return (
          <div className="deco-modal__row">
            {COLORS.map(c => (
              <BrassButton
                key={c}
                label={`Set ${INDUSTRY[c].label} to $${String(prompt.payload?.amount ?? '')}`}
                onClick={() => send({ color: c })}
              />
            ))}
          </div>
        );
      case 'adjust_two_stocks_choice':
        return (
          <>
            <div className="deco-modal__row">
              <span>Raise:</span>
              <select
                className="deco-select"
                value={draft.upColor ?? ''}
                onChange={e => setDraft({ ...draft, upColor: e.target.value })}
              >
                <option value="">--</option>
                {COLORS.map(c => <option key={c} value={c}>{INDUSTRY[c].label}</option>)}
              </select>
            </div>
            <div className="deco-modal__row">
              <span>Lower:</span>
              <select
                className="deco-select"
                value={draft.downColor ?? ''}
                onChange={e => setDraft({ ...draft, downColor: e.target.value })}
              >
                <option value="">--</option>
                {COLORS.map(c => <option key={c} value={c}>{INDUSTRY[c].label}</option>)}
              </select>
            </div>
            <div className="deco-modal__footer">
              <BrassButton
                label="Submit"
                primary
                onClick={() => send(draft)}
                disabled={!draft.upColor || !draft.downColor}
              />
            </div>
          </>
        );
      case 'wild_speculation_choice':
        return (
          <div className="deco-modal__row">
            <span>{INDUSTRY[prompt.payload?.color as Color].label} ±{prompt.payload?.amount as number}:</span>
            <BrassButton label="Raise" onClick={() => send({ sign: 'up' })} />
            <BrassButton label="Lower" onClick={() => send({ sign: 'down' })} />
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
          <>
            <div style={{ marginBottom: 8 }}>Pick {keepCount}:</div>
            <ul>
              {drawn.map(d => (
                <li key={d.uid}>
                  <BrassButton
                    label={`${kept.includes(d.uid) ? '✓ ' : ''}${relabelColors(d.summary)}`}
                    onClick={() => toggle(d.uid)}
                  />
                </li>
              ))}
            </ul>
            <div className="deco-modal__footer">
              <BrassButton
                label="Submit"
                primary
                onClick={() => send({ keepUids: kept })}
                disabled={kept.length !== keepCount}
              />
            </div>
          </>
        );
      }
      case 'final_tip_play_choice': {
        const tipText = (prompt.payload?.tipText as string) ?? '';
        return (
          <>
            <p>{relabelColors(tipText)}</p>
            <p className="deco-modal__note">
              The Insider Tip deck is now empty. Playing this tip resolves it before the game ends; declining leaves it in your hand. Either way, the game ends after you choose.
            </p>
            <div className="deco-modal__footer">
              <BrassButton label="Decline" onClick={() => send({ play: false })} />
              <BrassButton label="Play" primary onClick={() => send({ play: true })} />
            </div>
          </>
        );
      }
      case 'pick_target_player':
        return (
          <div className="deco-modal__row">
            {state.players
              .filter(p => p.playerId !== state.myPlayer?.playerId)
              .map(p => (
                <BrassButton key={p.playerId} label={p.name} onClick={() => send({ targetId: p.playerId })} />
              ))}
          </div>
        );
      case 'pick_stock_from_target': {
        const stocks = prompt.payload?.stocks as { uid: string; color: string; name?: string }[];
        return (
          <div className="deco-modal__row">
            {stocks.map(s => (
              <BrassButton
                key={s.uid}
                label={`${INDUSTRY[s.color as Color]?.label ?? s.color}${s.name ? ` ${s.name}` : ''}`}
                onClick={() => send({ stockUid: s.uid })}
              />
            ))}
          </div>
        );
      }
      case 'pick_market_card':
        return (
          <div className="deco-modal__row">
            {state.market.map(c => (
              <BrassButton
                key={c.uid}
                label={
                  c.category === 'stock'
                    ? `${INDUSTRY[c.color].label}${c.name ? ` ${c.name}` : ''}`
                    : `Action: ${c.name}`
                }
                onClick={() => send({ cardUid: c.uid })}
              />
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
          <>
            <div className="deco-modal__row">
              {eligible.map(c => (
                <BrassButton
                  key={c.uid}
                  label={describeCard(c).title}
                  onClick={() => send({ stockUid: c.uid })}
                />
              ))}
            </div>
            {mode === 'sell_bonus_batch' && (
              <div className="deco-modal__footer">
                <BrassButton label="Done" primary onClick={() => send({ done: true })} />
              </div>
            )}
          </>
        );
      }
      default:
        return <div>Unhandled prompt type: {prompt.type}</div>;
    }
  }

  return (
    <>
      <div className="deco-overlay" />
      <div className="deco-modal">
        <div className="deco-modal__deco deco-modal__deco--tl"><DecoCorner size={18} color={C.brass} /></div>
        <div className="deco-modal__deco deco-modal__deco--tr"><DecoCorner size={18} color={C.brass} rotate={90} /></div>
        <div className="deco-modal__deco deco-modal__deco--bl"><DecoCorner size={18} color={C.brass} rotate={270} /></div>
        <div className="deco-modal__deco deco-modal__deco--br"><DecoCorner size={18} color={C.brass} rotate={180} /></div>
        <h3 className="deco-modal__title">{relabelColors(prompt.message)}</h3>
        <div className="deco-modal__body">{renderBody()}</div>
      </div>
    </>
  );
}
