'use client';

/**
 * AskBar — natural-language time travel (⌘K).
 *
 * Type "Maradona's second goal, through his eyes, in slow motion" and the
 * playback state becomes exactly that. Parsing is local-first (lib/ask.ts —
 * instant, offline, demo-safe); when the local grammar can't make sense of a
 * query, we fall back to the Claude-backed /api/ask route if the server has
 * an ANTHROPIC_API_KEY. The interpretation is previewed live under the input
 * so the user sees what Enter will do before committing.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMatch } from '@/state/match';
import { playhead, useClock } from '@/state/clock';
import { AskPlan, askLocal, askSuggestions } from '@/lib/ask';
import styles from './hud.module.css';

function execute(plan: AskPlan) {
  const s = useClock.getState();
  if (plan.follow) s.setFollow(plan.follow);
  if (plan.camera) s.setCameraMode(plan.camera);
  if (plan.speed !== undefined) s.setSpeed(plan.speed);
  if (plan.seekT !== undefined) s.seek(plan.seekT);
  if (plan.play || plan.speed !== undefined) s.play();
}

/** one flag per session: does the server have a key for the smart fallback? */
let remoteAvailable: boolean | null = null;

async function askRemote(query: string, model: ReturnType<typeof useMatch>): Promise<AskPlan | null> {
  if (remoteAvailable === false) return null;
  const { ir, players, events, teamById } = model;
  const ctx = {
    title: ir.meta.title,
    competition: ir.meta.competition,
    duration: Math.round(ir.duration),
    currentT: Math.round(playhead.t),
    teams: ir.meta.teams.map((t) => ({ id: t.id, name: t.name })),
    players: players.map((p) => ({ id: p.id, name: p.name, team: p.team, number: p.number })),
    events: events
      .filter((e) => e.text || (e.importance ?? 0) >= 0.55)
      .map((e) => ({
        t: Math.round(e.t * 10) / 10,
        type: e.type,
        actor: e.actor,
        team: e.team ? teamById[e.team]?.short : undefined,
        text: e.text,
      })),
    cameras: ['broadcast', 'cinematic (auto-director)', 'pov (through a player’s eyes)', 'orbit', 'fly'],
  };
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 6000);
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, context: ctx }),
      signal: ac.signal,
    });
    clearTimeout(timer);
    if (res.status === 501) {
      remoteAvailable = false;
      return null;
    }
    if (!res.ok) return null;
    remoteAvailable = true;
    const plan = (await res.json()) as AskPlan;
    return plan?.ok ? plan : null;
  } catch {
    return null;
  }
}

export default function AskBar() {
  const model = useMatch();
  const open = useClock((s) => s.askOpen);
  const setOpen = useClock((s) => s.setAskOpen);
  const [query, setQuery] = useState('');
  const [thinking, setThinking] = useState(false);
  const [miss, setMiss] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  const suggestions = useMemo(() => askSuggestions(model), [model]);

  const preview = useMemo(
    () => (query.trim() ? askLocal(query, model, playhead.t) : null),
    [query, model]
  );

  useEffect(() => {
    if (open) {
      setQuery('');
      setMiss(null);
      // focus after the panel paints
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const showToast = useCallback((label: string) => {
    setToast(label);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  const run = useCallback(
    async (q: string) => {
      const local = askLocal(q, model, playhead.t);
      if (local.ok) {
        execute(local);
        setOpen(false);
        showToast(local.label);
        return;
      }
      // local grammar missed — try the Claude route
      setThinking(true);
      const remote = await askRemote(q, model);
      setThinking(false);
      if (remote?.ok) {
        execute(remote);
        setOpen(false);
        showToast(remote.label);
      } else {
        setMiss(local.label);
      }
    },
    [model, setOpen, showToast]
  );

  return (
    <>
      {open && (
        <div className={styles.askBackdrop} onClick={() => setOpen(false)}>
          <div
            className={styles.ask}
            role="dialog"
            aria-label="Ask the match"
            onClick={(e) => e.stopPropagation()}
          >
            <form
              className={styles.askForm}
              onSubmit={(e) => {
                e.preventDefault();
                if (query.trim() && !thinking) void run(query);
              }}
            >
              <span className={styles.askPrompt} aria-hidden>
                ›
              </span>
              <input
                ref={inputRef}
                className={styles.askInput}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setMiss(null);
                }}
                onKeyDown={(e) => {
                  if (e.code === 'Escape') setOpen(false);
                }}
                placeholder="Ask the match — “show me the second goal in slow motion”"
                spellCheck={false}
                autoComplete="off"
              />
              <kbd className={styles.askKbd}>esc</kbd>
            </form>

            <div className={styles.askPreview} aria-live="polite">
              {thinking
                ? 'Asking Claude…'
                : miss
                  ? miss
                  : preview
                    ? preview.ok
                      ? `↳ ${preview.label}`
                      : preview.label
                    : 'Jump to any moment, follow any player, switch any camera — in plain language.'}
            </div>

            <div className={styles.askChips}>
              {suggestions.map((s) => (
                <button
                  key={s}
                  className={styles.askChip}
                  onClick={() => {
                    setQuery(s);
                    void run(s);
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div className={styles.askToast} aria-live="polite">
          {toast}
        </div>
      )}
    </>
  );
}
