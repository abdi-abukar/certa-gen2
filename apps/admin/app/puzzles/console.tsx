'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Image from 'next/image';
import styles from './puzzles.module.css';

type Puzzle = { id: string; revision: number; state: 'draft' | 'scheduled' | 'cancelled'; prompt: string; image_id: string | null; answer_mask: string; reward_ticket_id: string; reward_cap: number; claimed: number; live_on: string; starts_at: string; ends_at: string; images?: Record<string, string> };
type Draft = { id: string; revision: number; prompt: string; image_id: string | null; answer: string; reward_ticket_id: string; reward_cap: number; live_on: string };
const blank = (): Draft => ({ id: crypto.randomUUID(), revision: 0, prompt: '', image_id: null, answer: '', reward_ticket_id: '', reward_cap: 100, live_on: '' });
class ApiError extends Error { constructor(public code: string, public status: number) { super(code); } }
async function api(path: string, body?: unknown, signal?: AbortSignal) {
  const response = await fetch(`/api/content/${path}`, { cache: 'no-store', signal: signal ?? AbortSignal.timeout(20000), ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  const data = await response.json();
  if (!response.ok) throw new ApiError(data.error ?? 'request_failed', response.status);
  return data;
}
function errorText(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Your session has expired. Sign in again.';
    if (error.status === 403) return 'Your staff account does not have permission for this action.';
    if (error.code === 'conflict') return 'This record changed, was already published, or another puzzle occupies this Sunday. Reload before continuing.';
    if (error.code === 'sunday_required') return 'Choose a Sunday for the release date.';
    if (error.code.startsWith('invalid_image')) return 'Use a valid GIF, PNG, JPEG or WebP under 4 MB, with at most 100 frames and 16 million total decoded pixels.';
    if (error.code === 'puzzle_not_configured' || error.code === 'content_not_configured') return 'Puzzle service configuration is incomplete. Contact the deployment owner.';
    if (error.status < 500) return `Could not complete this action (${error.code}).`;
  }
  return 'The request could not be confirmed. Reload the saved record before making another change.';
}
function status(puzzle: Puzzle) {
  if (puzzle.state !== 'scheduled') return puzzle.state === 'draft' ? 'Draft' : 'Cancelled';
  if (Date.parse(puzzle.ends_at) <= Date.now()) return 'Ended';
  return Date.parse(puzzle.starts_at) <= Date.now() ? 'Live' : 'Scheduled';
}

export function PuzzleConsole() {
  const [items, setItems] = useState<Puzzle[]>([]);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Puzzle | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [showImage, setShowImage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const lock = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const [listVersion, setListVersion] = useState(0);

  useEffect(() => {
    const abort = new AbortController();
    setLoading(true); setError('');
    api(`puzzles?offset=${offset}`, undefined, AbortSignal.any([abort.signal, AbortSignal.timeout(20000)]))
      .then(data => { if (!abort.signal.aborted) setItems(data.items); })
      .catch(e => { if (!abort.signal.aborted) setError(errorText(e)); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [offset, listVersion]);
  useEffect(() => () => controller.current?.abort(), []);

  function edit(p: Puzzle) {
    setShowImage(false); setSelected(p); setDraft({ id: p.id, revision: p.revision, prompt: p.prompt, image_id: p.image_id, answer: '', reward_ticket_id: p.reward_ticket_id, reward_cap: p.reward_cap, live_on: p.live_on });
    setImage(p.image_id ? p.images?.[p.image_id] ?? null : null); setDirty(false); setUncertain(false);
  }
  function change<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft(current => current ? { ...current, [key]: value } : current); setDirty(true); setMessage('');
  }
  async function run(action: (signal: AbortSignal) => Promise<void>, mutation = false) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    const abort = new AbortController(); controller.current = abort;
    try { await action(AbortSignal.any([abort.signal, AbortSignal.timeout(30000)])); }
    catch (e) {
      if (!abort.signal.aborted) {
        setError(errorText(e));
        if (mutation && (!(e instanceof ApiError) || e.status >= 500 || e.code === 'conflict')) setUncertain(true);
      }
    } finally { lock.current = false; if (!abort.signal.aborted) setBusy(false); }
  }
  function open(id: string) { void run(async signal => {
    try { edit((await api(`puzzles/${id}`, undefined, signal)).item); }
    catch (e) {
      if (e instanceof ApiError && e.status === 404 && !selected && uncertain) {
        setUncertain(false); setMessage('No saved record was found. You can save this draft again.');
      } else throw e;
    }
  }); }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!draft || uncertain) return;
    const { id, revision, ...puzzle } = draft;
    await run(async signal => {
      const result = await api('puzzles', { id, revision, puzzle }, signal);
      edit({ ...result.item, images: draft.image_id && image ? { [draft.image_id]: image } : {} });
      setMessage('Draft saved. Review it before scheduling.'); setListVersion(v => v + 1);
    }, true);
  }
  async function upload(uploaded: File) {
    if (uploaded.size > 4194304 || !['image/gif', 'image/png', 'image/jpeg', 'image/webp'].includes(uploaded.type)) { setError('Choose a GIF, PNG, JPEG or WebP file under 4 MB.'); return; }
    await run(async signal => {
      const response = await fetch('/api/content/assets', { method: 'POST', headers: { 'Content-Type': uploaded.type }, body: uploaded, signal, cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new ApiError(data.error, response.status);
      change('image_id', data.id); setImage(data.url); setShowImage(true); setMessage('Image uploaded. Save the draft to attach it.');
    });
    if (file.current) file.current.value = '';
  }
  function publish() {
    if (!selected || dirty || uncertain) return;
    void run(async signal => {
      const data = await api(`puzzles/${selected.id}/schedule`, { revision: selected.revision }, signal);
      edit({ ...data.item, images: selected.images }); setMessage('Puzzle scheduled. It becomes live automatically during its weekly window.'); setListVersion(v => v + 1);
    }, true);
  }
  function cancel() {
    if (!selected || uncertain) return;
    void run(async signal => {
      await api(`puzzles/${selected.id}/cancel`, {}, signal);
      edit({ ...selected, state: 'cancelled' }); setMessage('Puzzle cancelled. Existing reward records are preserved.'); setListVersion(v => v + 1);
    }, true);
  }
  const readOnly = !!selected && selected.state !== 'draft';
  return <section className={styles.console}>
    <header className={styles.heading}><div><h1>Weekly puzzles</h1><p>A clue, a Sunday, and a ticket worth solving for.</p></div><button type="button" disabled={busy || dirty} onClick={() => { setSelected(null); setDraft(blank()); setImage(null); setDirty(false); setUncertain(false); setMessage(''); setError(''); }}>New puzzle</button></header>
    <p className={styles.schedule}>Sundays at 5 PM Toronto · one scheduled puzzle per Sunday · closes the following Sunday</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {message && <p role="status" className={styles.notice}>{message}</p>}
    <div className={styles.workspace}>
      <aside className={styles.list} aria-label="Saved puzzles">
        {loading ? <p role="status">Loading puzzles…</p> : items.length ? items.map(p => <button type="button" key={p.id} className={styles.item} aria-pressed={selected?.id === p.id} disabled={busy || dirty} onClick={() => open(p.id)}><span>{p.live_on} · {status(p)}</span><strong>{p.prompt}</strong><small>{p.claimed} / {p.reward_cap} claimed</small></button>) : <p>No puzzles on this page.</p>}
        <div className={styles.actions}><button type="button" disabled={busy || loading || offset === 0} onClick={() => setOffset(v => Math.max(0, v - 50))}>Previous</button><button type="button" disabled={busy || loading || items.length < 50 || offset >= 100000} onClick={() => setOffset(v => v + 50)}>Next</button><button type="button" disabled={busy || loading} onClick={() => setListVersion(v => v + 1)}>Refresh list</button></div>
      </aside>
      {!draft ? <div className={styles.empty}><h2>Make next Sunday’s clue.</h2><p>Create a draft or choose a saved puzzle to review its clue, ticket and schedule.</p></div> : <div className={styles.editor}>
        <div className={styles.editorHeading}><h2>{selected ? `${status(selected)} puzzle` : 'New puzzle'}</h2><span>{selected ? `Revision ${selected.revision}` : 'Not saved'}</span></div>
        <form onSubmit={save}>
          <fieldset disabled={busy || readOnly || uncertain}>
            <label>Clue<textarea required maxLength={2000} rows={4} value={draft.prompt} onChange={e => change('prompt', e.target.value)} /></label>
            <label>Clue image or GIF<input ref={file} type="file" accept="image/gif,image/png,image/jpeg,image/webp" onChange={e => { if (e.target.files?.[0]) void upload(e.target.files[0]); }} /></label>
            <p className={styles.hint}>Up to 4 MB, 100 frames and 16 million total pixels. Animation is preserved as WebP.</p>

            <label>Answer<input value={draft.answer} maxLength={64} required={!readOnly} autoComplete="off" spellCheck={false} onChange={e => change('answer', e.target.value)} /></label>
            <p className={styles.hint}>{selected ? `${selected.answer_mask.length} characters saved. Re-enter the full answer to save edits; stored answers cannot be read back.` : '1–24 letters or numbers after spaces and punctuation are removed.'}</p>
            <div className={styles.fields}><label>Sunday release date<input type="date" required value={draft.live_on} onChange={e => change('live_on', e.target.value)} /></label><label>Ticket limit<input type="number" min={1} max={10000} required value={draft.reward_cap} onChange={e => change('reward_cap', Number(e.target.value))} /></label></div>
            <label>Reward ticket definition ID<input required maxLength={128} value={draft.reward_ticket_id} onChange={e => change('reward_ticket_id', e.target.value)} placeholder="Ticket definition ID" /></label>
            <p className={styles.hint}>Use the ticket issuer’s definition ID. Issuance is confirmed separately after a correct answer; this field does not create a ticket definition.</p>
          </fieldset>
            {image && <div className={styles.imagePreview}><button type="button" onClick={() => setShowImage(value => !value)}>{showImage ? 'Hide preview' : 'Show image / animation'}</button>{showImage && <Image src={image} alt={draft.prompt || 'Puzzle clue preview'} width={640} height={360} sizes="(max-width: 700px) 90vw, 540px" />}<button type="button" disabled={readOnly || busy || uncertain} onClick={() => { change('image_id', null); setImage(null); }}>Remove image</button></div>}
          {!readOnly && <button type="submit" className={styles.primary} disabled={busy || uncertain || !draft.answer.trim()}>{busy ? 'Working…' : 'Save draft'}</button>}
        </form>
        {dirty && <p className={styles.hint}>Unsaved changes. Save them or discard them before switching puzzles.</p>}
        {dirty && !uncertain && <button type="button" disabled={busy} onClick={() => { if (selected) open(selected.id); else { setDraft(null); setDirty(false); } }}>Discard edits</button>}
        {selected && <div className={styles.review}><h3>Release window</h3><p>{new Date(selected.starts_at).toLocaleString('en-CA', { timeZone: 'America/Toronto' })} → {new Date(selected.ends_at).toLocaleString('en-CA', { timeZone: 'America/Toronto' })} Toronto</p><p>{selected.claimed} of {selected.reward_cap} tickets claimed.</p><div className={styles.actions}>{selected.state === 'draft' && <button type="button" className={styles.primary} disabled={busy || dirty || uncertain} onClick={publish}>Schedule this puzzle</button>}{selected.state !== 'cancelled' && <button type="button" disabled={busy || dirty || uncertain} onClick={cancel}>Cancel puzzle</button>}</div>{selected.state === 'scheduled' && <p className={styles.hint}>Scheduled clues, answers and ticket links are locked. Cancel and create a new puzzle to replace them.</p>}</div>}
        {uncertain && <button type="button" disabled={busy} onClick={() => open(draft.id)}>Reload saved record</button>}
      </div>}
    </div>
  </section>;
}
