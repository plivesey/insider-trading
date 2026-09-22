import { useEffect, useState } from 'react';
import type { Color, HandCard, ProjectedGameState, PromptEnvelope, StockCard } from '@insider-trading/shared';
import { api } from '../lib/api.js';
import { showError } from '../lib/toast.js';
import { describeCard } from './cardLabel.js';
import { CardTile } from './CardTile.js';
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
  const [minimized, setMinimized] = useState(false);
  const canMinimize = prompt.type === 'setup_draft_pick';

  // Start expanded on every new prompt (e.g. each draft round).
  useEffect(() => {
    setMinimized(false);
  }, [prompt.promptId]);

  async function send(response: Record<string, unknown>) {
    try {
      await api.promptResponse({ promptId: prompt.promptId, response });
    } catch (e) {
      showError((e as Error).message);
    }
  }

  function renderBody() {
    switch (prompt.type) {
      case 'setup_draft_pick': {
        const candidates = (prompt.payload?.candidates as HandCard[]) ?? [];
        const round = (prompt.payload?.round as number) ?? 1;
        return (
          <>
            <div className="deco-modal__notice">
              Round {round} of 3 — keep one card, the rest pass to the player on your left.
            </div>
            <div className="card-row">
              {candidates.map(c => (
                <CardTile
                  key={c.uid}
                  card={c as any}
                  onClick={() => send({ keepUid: c.uid })}
                  goalContext="hand"
                  variant={state.variant}
                />
              ))}
            </div>
          </>
        );
      }
      case 'foresight_reorder': {
        const candidateUids = (prompt.payload?.candidateUids as string[]) ?? [];
        const cards = (prompt.payload?.cards as Array<{ uid: string; kind: string; text: string }>) ?? [];
        const textByUid = new Map(cards.map(c => [c.uid, `${c.kind === 'goal' ? 'Goal: ' : ''}${relabelColors(c.text)}`]));
        const describe = (uid: string) => textByUid.get(uid) ?? uid;
        const order = (draft.order as string[]) ?? candidateUids;
        const buriedUid = draft.buriedUid as string | undefined;
        const kept = order.filter(u => u !== buriedUid);
        function move(uid: string, dir: -1 | 1) {
          const idx = kept.indexOf(uid);
          const next = idx + dir;
          if (next < 0 || next >= kept.length) return;
          const copy = kept.slice();
          [copy[idx], copy[next]] = [copy[next], copy[idx]];
          setDraft({ ...draft, order: buriedUid ? [...copy, buriedUid] : copy });
        }
        function toggleBury(uid: string) {
          if (buriedUid === uid) {
            setDraft({ ...draft, buriedUid: undefined, order: candidateUids });
            return;
          }
          // Derive the new order from the full `order` (which still contains
          // every candidate, including whichever one is currently buried),
          // not `kept` (which has already excluded it) -- otherwise burying a
          // second card permanently drops the first one from `order`
          // entirely instead of un-burying it, and the mismatched count then
          // makes Submit impossible.
          setDraft({ ...draft, buriedUid: uid, order: [...order.filter(u => u !== uid), uid] });
        }
        return (
          <>
            <div className="deco-modal__notice">
              Reorder the top {candidateUids.length} event cards (top first). Optionally bury one at the bottom.
            </div>
            <ul>
              {kept.map((uid, i) => (
                <li key={uid} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <BrassButton label="↑" onClick={() => move(uid, -1)} />
                  <BrassButton label="↓" onClick={() => move(uid, 1)} />
                  <span>{describe(uid)}</span>
                  <BrassButton label="Bury" onClick={() => toggleBury(uid)} />
                </li>
              ))}
              {buriedUid && (
                <li key={buriedUid} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, opacity: 0.7 }}>
                  <span>{describe(buriedUid)} (buried at the bottom)</span>
                  <BrassButton label="Un-bury" onClick={() => toggleBury(buriedUid)} />
                </li>
              )}
            </ul>
            <div className="deco-modal__footer">
              <BrassButton
                label="Submit"
                primary
                onClick={() => send(buriedUid ? { keepOrder: kept, buriedUid } : { keepOrder: kept })}
              />
            </div>
          </>
        );
      }
      case 'backroom_deal_pick_own_card': {
        const my = state.myPlayer;
        if (!my) return null;
        const eligible = my.hand.filter(c => c.category !== 'bonus');
        return (
          <div className="deco-modal__row">
            {eligible.map(c => (
              <BrassButton
                key={c.uid}
                label={describeCard(c).title}
                onClick={() => send({ cardUid: c.uid })}
              />
            ))}
          </div>
        );
      }
      case 'double_down_pick_card': {
        const eligibleUids = (prompt.payload?.eligibleUids as string[]) ?? [];
        const my = state.myPlayer;
        return (
          <div className="deco-modal__row">
            {eligibleUids.map(uid => {
              const card = my?.hand.find(c => c.uid === uid);
              return (
                <BrassButton
                  key={uid}
                  label={card ? describeCard(card).title : uid}
                  onClick={() => send({ cardUid: uid })}
                />
              );
            })}
          </div>
        );
      }
      case 'peek_ack': {
        const cards = (prompt.payload?.cards as Array<{ uid: string; kind: string; text: string }>) ?? [];
        return (
          <>
            {cards.length > 0 && (
              <ul>
                {cards.map(c => (
                  <li key={c.uid}>
                    {c.kind === 'goal' ? 'Goal: ' : ''}
                    {relabelColors(c.text)}
                  </li>
                ))}
              </ul>
            )}
            <div className="deco-modal__footer">
              <BrassButton label="OK" primary onClick={() => send({})} />
            </div>
          </>
        );
      }
      case 'peek_bottom_choice': {
        const cards = (prompt.payload?.cards as Array<{ uid: string; kind: string; text: string }>) ?? [];
        return (
          <>
            <div className="deco-modal__notice">
              Top {cards.length} event card{cards.length > 1 ? 's' : ''} (top first). You may send one to the
              bottom of the deck.
            </div>
            <div className="deco-modal__row">
              {cards.map((c, i) => (
                <BrassButton
                  key={c.uid}
                  label={`↓ Bottom: ${relabelColors(c.text)}${i === 0 ? ' (next)' : ''}`}
                  onClick={() => send({ bottomUid: c.uid })}
                />
              ))}
            </div>
            <div className="deco-modal__footer">
              <BrassButton label="Keep in place" primary onClick={() => send({})} />
            </div>
          </>
        );
      }
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
        const drawn = (prompt.payload?.drawn as { uid: string; card: HandCard }[]) ?? [];
        const keepCount = prompt.payload?.keepCount as number;
        const kept = (draft.keepUids as string[]) ?? [];
        function toggle(uid: string) {
          if (kept.includes(uid)) setDraft({ keepUids: kept.filter(u => u !== uid) });
          else if (kept.length < keepCount) setDraft({ keepUids: [...kept, uid] });
        }
        return (
          <>
            <div style={{ marginBottom: 8 }}>Pick {keepCount}:</div>
            <div className="card-row">
              {drawn.map(d => (
                <CardTile
                  key={d.uid}
                  card={d.card}
                  onClick={() => toggle(d.uid)}
                  className={kept.includes(d.uid) ? 'card-tile--selected' : ''}
                  goalContext="hand"
                  variant={state.variant}
                />
              ))}
            </div>
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
      case 'pick_market_card': {
        const mode = (prompt.payload?.mode as string) ?? '';
        const auctionUid = state.auction?.cardUid;
        const pickable = state.market.filter(c => {
          // The card being auctioned is never a valid target.
          if (c.uid === auctionUid) return false;
          // Fire Sale is a real (discounted) purchase: only colored stocks.
          if (mode === 'fire_sale') {
            return c.category === 'stock' && c.color !== 'Wild';
          }
          return true;
        });
        return (
          <div className="deco-modal__row">
            {pickable.map(c => (
              <BrassButton
                key={c.uid}
                label={describeCard(c as any).title}
                onClick={() => send({ cardUid: c.uid })}
              />
            ))}
          </div>
        );
      }
      case 'pick_hand_stock_for_swap': {
        const my = state.myPlayer;
        if (!my) return null;
        // Swap allows any non-bonus card in hand -- stocks, action/starter
        // cards, market-movement cards, even a private goal. The chosen
        // card goes into the market to be auctioned normally.
        return (
          <div className="deco-modal__row">
            {my.hand.filter(c => c.category !== 'bonus').map(c => (
              <BrassButton
                key={c.uid}
                label={describeCard(c).title}
                onClick={() => send({ stockUid: c.uid })}
              />
            ))}
          </div>
        );
      }
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
            {(mode === 'sell_bonus_batch' || mode === 'sell_same_bonus') && (
              <div className="deco-modal__footer">
                <BrassButton label="Done" primary onClick={() => send({ done: true })} />
              </div>
            )}
          </>
        );
      }
      case 'final_goal_offer': {
        const goalText = (prompt.payload?.goalText as string) ?? '';
        const rewardText = (prompt.payload?.rewardText as string) ?? '';
        return (
          <>
            <div className="deco-modal__notice">
              {relabelColors(goalText)} → {relabelColors(rewardText)}
            </div>
            <div className="deco-modal__footer">
              <BrassButton label="Claim It" primary onClick={() => send({ claim: true })} />
              <BrassButton label="Skip" onClick={() => send({ claim: false })} />
            </div>
          </>
        );
      }
      default:
        return <div>Unhandled prompt type: {prompt.type}</div>;
    }
  }

  if (canMinimize && minimized) {
    return (
      <button className="deco-modal-tab" onClick={() => setMinimized(false)}>
        <span>{relabelColors(prompt.message)}</span>
        <span className="deco-modal-tab__expand">▲ Expand</span>
      </button>
    );
  }

  return (
    <>
      <div className="deco-overlay" onClick={canMinimize ? () => setMinimized(true) : undefined} />
      <div className="deco-modal">
        <div className="deco-modal__deco deco-modal__deco--tl"><DecoCorner size={18} color={C.brass} /></div>
        <div className="deco-modal__deco deco-modal__deco--tr"><DecoCorner size={18} color={C.brass} rotate={90} /></div>
        <div className="deco-modal__deco deco-modal__deco--bl"><DecoCorner size={18} color={C.brass} rotate={270} /></div>
        <div className="deco-modal__deco deco-modal__deco--br"><DecoCorner size={18} color={C.brass} rotate={180} /></div>
        <h3 className="deco-modal__title">
          {relabelColors(prompt.message)}
          {canMinimize && (
            <button
              className="deco-modal__minimize"
              onClick={() => setMinimized(true)}
              title="Minimize to view the market and goals"
            >
              ▾ Minimize
            </button>
          )}
        </h3>
        <div className="deco-modal__body">{renderBody()}</div>
      </div>
    </>
  );
}
