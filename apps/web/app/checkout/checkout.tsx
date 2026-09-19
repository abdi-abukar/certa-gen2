'use client';
import Link from 'next/link';
import type { AccountPerson } from '@certa/ui-web/account-menu';
import { CustomerMasthead } from '../_components/customer-masthead';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CountryPicker } from '../_components/country-picker';
import { SecurePayment } from './secure-payment';
import { CheckoutError, commerce, money, pendingPurchase, safeInvoiceUrl, type Attempt, type Catalog, type Context, type Creator, type Purchase, type Quote, type Ticket, type Token } from './model';
import styles from './checkout.module.css';

type OrderHistory = { items: { id: string; state: string; created_at: string }[]; next: string | null };
type Selection = { product_id: string; quantity: number; ticket_id: string | null; affiliate_code: string | null; coupon_code: string | null };
function purchaseUrl(id?: string) { const url = new URL(window.location.href); if (id) url.searchParams.set('checkout', id); else url.searchParams.delete('checkout'); window.history.replaceState(null, '', `${url.pathname}${url.search}`); }

export default function Checkout({ person, initialProductId, initialCheckoutId, initialTicketId }: { person: AccountPerson; initialProductId?: string; initialCheckoutId?: string; initialTicketId?: string }) {
 const [catalog, setCatalog] = useState<Catalog | null>(null), [context, setContext] = useState<Context | null>(null), [purchase, setPurchase] = useState<Purchase | null>(null), [quote, setQuote] = useState<Quote | null>(null);
 const [selection, setSelection] = useState<Selection>({ product_id: '', quantity: 1, ticket_id: null, affiliate_code: null, coupon_code: null });
 const [tickets, setTickets] = useState<Ticket[]>([]), [ticketError, setTicketError] = useState(false), [attempt, setAttempt] = useState<Attempt | null>(null);
 const [name, setName] = useState(''), [country, setCountry] = useState(''), [province, setProvince] = useState(''), [accepted, setAccepted] = useState(false), [method, setMethod] = useState<'card' | 'crypto'>('card');
 const [address, setAddress] = useState(''), [city, setCity] = useState(''), [postal, setPostal] = useState('');
 const [code, setCode] = useState(''), [busy, setBusy] = useState(false), [quoting, setQuoting] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [loadError, setLoadError] = useState(false), [uncertain, setUncertain] = useState(false), [checking, setChecking] = useState(false);
 const mounted = useRef(true), mutation = useRef(false), quoteRequest = useRef(0), heading = useRef<HTMLHeadingElement>(null);
 const stage = uncertain || purchase?.checkout.state === 'pending' || purchase?.checkout.state === 'paid' || purchase?.checkout.state === 'cancelled' ? 'status' : attempt ? 'payment' : 'review';
 const applyPurchase = useCallback((next: Purchase) => { setPurchase(next); setUncertain(false); purchaseUrl(next.checkout.id); if (next.checkout.state !== 'open') setAttempt(null); }, []);
 const initialize = useCallback(async () => {
  setError(''); setLoadError(false);
  try {
   const [catalog, context, purchase] = await Promise.all([commerce<Catalog>('catalog'), commerce<Context>('context'), commerce<Purchase | null>(initialCheckoutId ? `checkouts/${encodeURIComponent(initialCheckoutId)}` : 'current')]);
   if (!mounted.current) return;
   setCatalog(catalog); setContext(context);
   const active = purchase;
   if (active) applyPurchase(active); else setPurchase(null);
   const revision = active?.revision;
   if (active?.checkout.state === 'open' && active.attempts[0]?.state === 'declined') setNotice('Your payment was declined. Check your details or choose another payment method.');
   const next = { product_id: revision?.product_id ?? catalog.products.find(p => p.id === initialProductId)?.id ?? catalog.products[0]?.id ?? '', quantity: revision?.quantity ?? 1, ticket_id: revision?.ticket_id ?? initialTicketId ?? null, affiliate_code: revision?.affiliate_code ?? context.creator?.code ?? null, coupon_code: revision?.coupon_code ?? null };
   setSelection(next); setName(revision?.evidence.name ?? [context.profile?.first_name, context.profile?.last_name].filter(Boolean).join(' ')); setCountry(revision?.evidence.country ?? context.profile?.country ?? ''); setProvince(revision?.evidence.state ?? ''); setAddress(revision?.evidence.address ?? ''); setCity(revision?.evidence.city ?? ''); setPostal(revision?.evidence.postal_code ?? '');
   const prepared = active?.checkout.state === 'open' ? active.attempts.find(a => a.state === 'prepared') : null;
   if (prepared && revision?.evidence.terms_version === catalog.terms?.version) { setAttempt(prepared); setQuote(revision!); setAccepted(true); setMethod(prepared.processor === 'crypto' ? 'crypto' : 'card'); }
   else if (active?.checkout.state === 'open' || !active) {
    if (next.product_id) { const preview = await commerce<Quote>('quote', next); if (mounted.current) setQuote(preview); }
   } else if (revision) setQuote(revision);
  } catch (error) { if (mounted.current) { setError(error instanceof Error ? error.message : 'Checkout couldn’t load.'); setLoadError(true); } }
 }, [initialCheckoutId, initialProductId, initialTicketId, applyPurchase]);
 useEffect(() => { mounted.current = true; void initialize(); fetch('/api/tickets/mine', { cache: 'no-store', signal: AbortSignal.timeout(15000) }).then(async response => { if (!response.ok) throw new Error(); return response.json(); }).then(data => { if (mounted.current) setTickets(data.items ?? []); }).catch(() => { if (mounted.current) setTicketError(true); }); return () => { mounted.current = false; quoteRequest.current++; }; }, [initialize]);
 useEffect(() => { heading.current?.focus(); }, [stage]);
 const check = useCallback(async () => {
  if (!purchase) return; setChecking(true);
  try { const next = await commerce<Purchase>(`checkouts/${purchase.checkout.id}`); if (mounted.current) { applyPurchase(next); setError(''); } }
  catch { if (mounted.current) setError('We couldn’t check the latest status. Your purchase is saved. Try again shortly.'); }
  finally { if (mounted.current) setChecking(false); }
 }, [purchase?.checkout.id, applyPurchase]);
 useEffect(() => {
  if (!purchase || !(pendingPurchase(purchase) || uncertain)) return;
  let cancelled = false, count = 0, timer: ReturnType<typeof setTimeout>;
  const tick = async () => { if (cancelled || count >= 30) return; if (!document.hidden) { count++; await check(); } if (!cancelled) timer = setTimeout(tick, 5000); };
  timer = setTimeout(tick, 5000); return () => { cancelled = true; clearTimeout(timer); };
 }, [purchase?.checkout.id, purchase?.checkout.state, pendingPurchase(purchase), uncertain, check]);
 async function updateQuote(next: Selection, enteredCode?: string) {
  const request = ++quoteRequest.current; setQuoting(true); setError(''); setNotice('');
  try {
   const result = await commerce<Quote>('quote', { ...next, ...(enteredCode ? { code: enteredCode } : {}) });
   if (!mounted.current || request !== quoteRequest.current) return;
   // Applying a code is reversible. A worse code never replaces the displayed better offer.
   if (enteredCode && quote && result.total_cents > quote.total_cents) { setNotice('Your current discount gives you the better price. We’ve kept it.'); return; }
   if (enteredCode && result.affiliate_code && result.affiliate_code !== selection.affiliate_code) {
    const creator = await commerce<Creator>('creator', { code: result.affiliate_code });
    if (!mounted.current || request !== quoteRequest.current) return;
    setContext(value => value ? { ...value, creator } : value);
   }
   setSelection({ ...next, affiliate_code: result.affiliate_code, coupon_code: result.coupon_code, ticket_id: result.ticket_id }); setQuote(result); setLoadError(false); setCode('');
   if (enteredCode || next.ticket_id) setNotice(result.discount_kind === 'creator' && (result.affiliate_code !== enteredCode?.toUpperCase() || next.ticket_id) ? 'Your creator code gives you the better price.' : result.discount_kind ? 'Discount applied to your total.' : 'Creator code saved for this purchase.');
  } catch (error) { if (mounted.current && request === quoteRequest.current) setError(error instanceof Error ? error.message : 'Couldn’t check that discount.'); }
  finally { if (mounted.current && request === quoteRequest.current) setQuoting(false); }
 }
 async function prepare() {
  if (mutation.current || !quote || quoting) return; mutation.current = true; setBusy(true); setError(''); setNotice('');
  try {
   const next = await commerce<Purchase>('save', { ...selection, evidence: { name, country, state: province, address, city, postal_code: postal, accepted, terms_version: catalog?.terms?.version } });
   if (!mounted.current) return; applyPurchase(next); setQuote(next.revision);
   if (next.revision.total_cents !== quote.total_cents) { setNotice('Your price has changed. Review the updated total and continue when you’re ready.'); return; }
   const prepared = await commerce<Attempt>('prepare', { checkout_id: next.checkout.id, revision_id: next.revision.id, processor: method });
   if (mounted.current) setAttempt(prepared);
  } catch (error) { if (mounted.current) { setError(error instanceof Error ? error.message : 'Couldn’t prepare your checkout.'); if (error instanceof CheckoutError && error.code === 'payment_pending' && purchase) await check(); } }
  finally { mutation.current = false; if (mounted.current) setBusy(false); }
 }
 async function pay(token: Token) {
  if (mutation.current || !attempt || !purchase) return; mutation.current = true; setBusy(true); setError('');
  try { const next = await commerce<Purchase>('charge', { attempt_id: attempt.id, token }); if (mounted.current) { applyPurchase(next); setAttempt(null); if (next.checkout.state === 'open') setNotice('Your payment was declined. Check your details or choose another payment method.'); } }
  catch (error) {
   if (mounted.current) { setUncertain(true); setAttempt(null); setError('We’re checking whether your payment went through. Keep this checkout while confirmation is pending.'); }
   // A failed response can follow a successful charge; recover by reading the saved operation.
   try { const next = await commerce<Purchase>(`checkouts/${purchase.checkout.id}`); if (mounted.current) { applyPurchase(next); if (next.checkout.state === 'open') setError(error instanceof Error ? error.message : 'Payment wasn’t submitted. Review your order to continue.'); } } catch { /* Keep the uncertain state; never re-dispatch automatically. */ }
  } finally { mutation.current = false; if (mounted.current) setBusy(false); }
 }
 const currentQuote = stage === 'review' ? quote : purchase?.revision ?? quote;
 const available = context ? Math.min(3, context.allocation.available + (purchase?.checkout.state === 'open' && purchase.checkout.slot_order ? purchase.revision.quantity : 0)) : 0;
 const complianceNeeded = Boolean(context && !context.allocation.compliance.kyc && context.evaluation_count - (purchase?.checkout.state === 'open' && purchase.checkout.slot_order ? purchase.revision.quantity : 0) + selection.quantity > 1);
 const cards = catalog?.processors.some(p => p.id !== 'crypto' && p.enabled && p.configured) ?? false, cryptoEnabled = catalog?.processors.some(p => p.id === 'crypto' && p.enabled && p.configured) ?? false;
 const payable = currentQuote?.total_cents ?? 0, free = Boolean(currentQuote && payable === 0);
 const disabledReason = !catalog?.terms ? 'The evaluation agreement is currently unavailable.' : !available ? 'All three account slots are in use.' : complianceNeeded ? 'Complete compliance to add another evaluation.' : !free && (method === 'card' ? !cards : !cryptoEnabled) ? 'This payment method is currently unavailable.' : !free && method === 'crypto' && payable < 1000 ? 'Crypto payments require a total of at least $10.' : '';
 return <div className={styles.page}>
  <header className={styles.header}><Link href="/account" className={styles.brand}><img src="/brand/certa-crest.png" width="34" height="34" alt="" /><span>Certa Futures</span></Link><Link href="/account" className={styles.close}>Back to accounts <span aria-hidden>↗</span></Link></header>
  <main className={styles.main}>
   <CustomerMasthead person={person} />
   <nav className={styles.steps} aria-label="Checkout progress">{['Review', 'Payment', 'Account'].map((label, index) => { const current = stage === 'review' ? 0 : stage === 'payment' || purchase?.checkout.state !== 'paid' ? 1 : 2; return <span key={label} aria-current={current === index ? 'step' : undefined} data-complete={current > index}><i>{current > index ? '✓' : `0${index + 1}`}</i>{label}{index < 2 && <b aria-hidden />}</span>; })}</nav>
   <h1 ref={heading} tabIndex={-1} className={styles.title}>{stage === 'review' ? 'Purchase account' : stage === 'payment' ? 'Make it yours.' : purchase?.checkout.state === 'paid' ? 'You’re on your way.' : 'Your payment.'}</h1>
   {!catalog ? <section className={styles.loading} aria-busy={!loadError}>{loadError ? <><h2>Checkout couldn’t load.</h2><p role="alert">{error}</p><button className={styles.primary} onClick={() => void initialize()}>Try again</button></> : <><div /><div /><p role="status">Loading your checkout…</p></>}</section> : !catalog.products.length && !purchase ? <section className={styles.empty}><h2>Evaluations aren’t available yet.</h2><p>Check back shortly for pricing and available accounts.</p><Link href="/account" className={styles.primary}>Back to accounts →</Link></section> : <div className={styles.layout}>
    <aside className={styles.summary} aria-label="Order summary"><div className={styles.summaryArt} aria-hidden /><div className={styles.summaryBody}><p className={styles.eyebrow}>Certa evaluation</p><h2>{currentQuote?.product_label ?? 'Choose your evaluation'}</h2><p className={styles.summaryDescription}>A one-time purchase.<br />Your next step towards funded trading.</p>
     {currentQuote && <><dl className={styles.totals}><div><dt>{currentQuote.quantity} × Evaluation</dt><dd>{money(currentQuote.subtotal_cents)}</dd></div>{currentQuote.total_cents < currentQuote.subtotal_cents && <div className={styles.discount}><dt>{currentQuote.discount_kind === 'creator' ? currentQuote.affiliate_code : currentQuote.discount_kind === 'coupon' ? currentQuote.coupon_code : 'Reward ticket'}</dt><dd>−{money(currentQuote.subtotal_cents - currentQuote.total_cents)}</dd></div>}<div className={styles.total}><dt>{purchase?.checkout.state === 'paid' ? 'Paid' : 'Total'} <small>USD</small></dt><dd>{quoting ? <span aria-label="Updating price">…</span> : money(currentQuote.total_cents)}</dd></div></dl>{currentQuote.affiliate_code && currentQuote.discount_kind !== 'creator' && <p className={styles.supporting}>Supporting <strong>{currentQuote.affiliate_code}</strong></p>}</>}
     <Link href="/account/rules" target="_blank" className={styles.rules}>Evaluation rules <span aria-hidden>↗</span></Link><p className={styles.disclosure}>Simulated trading evaluation. Account setup begins after payment confirmation.</p>
    </div></aside>
    <div className={styles.content}>
     {error && <div role="alert" className={styles.error}>{error}{loadError && <button className={styles.textButton} onClick={() => void initialize()}>Reload checkout</button>}</div>}{notice && <p className={styles.notice} role="status">{notice}</p>}
     {stage === 'status' && purchase ? <PurchaseStatus purchase={purchase} uncertain={uncertain} checking={checking} check={check} /> : stage === 'payment' && attempt ? <SecurePayment key={attempt.id} attempt={attempt} total={payable} config={catalog.processors.find(p => p.id === attempt.processor)} busy={busy} pay={pay} onBack={() => setAttempt(null)} /> : <>
      <section className={styles.order}><div className={styles.sectionTitle}><h2>Your evaluation</h2>{context && <span>{context.allocation.occupied} of {context.allocation.limit} slots in use</span>}</div>
       <div className={styles.orderFields}><label>Account<select value={selection.product_id} disabled={busy || quoting} onChange={event => void updateQuote({ ...selection, product_id: event.target.value })}>{catalog.products.map(product => <option key={product.id} value={product.id}>{product.label} · {money(product.price_cents)}</option>)}</select></label><label>Quantity<select value={selection.quantity} disabled={busy || quoting} onChange={event => void updateQuote({ ...selection, quantity: Number(event.target.value) })}>{[1, 2, 3].map(n => <option key={n} value={n} disabled={n > available}>{n}</option>)}</select></label></div>
       <form className={styles.codeForm} onSubmit={event => { event.preventDefault(); void updateQuote({ ...selection, ticket_id: null }, code); }}><label>Creator or coupon code<input value={code} onChange={event => setCode(event.target.value.toUpperCase())} maxLength={60} autoComplete="off" autoCapitalize="characters" placeholder={selection.affiliate_code ?? selection.coupon_code ?? 'Enter a code'} disabled={busy || quoting} /></label><button className={styles.secondary} disabled={busy || quoting || !code.trim()}>{quoting ? 'Checking…' : 'Apply'}</button></form>
       {(selection.affiliate_code || selection.coupon_code) && <div className={styles.applied}>{selection.affiliate_code && <span>Creator <b>{selection.affiliate_code}</b><button aria-label="Remove creator code from this checkout" disabled={busy || quoting} onClick={() => void updateQuote({ ...selection, affiliate_code: null })}>×</button></span>}{selection.coupon_code && <span>Coupon <b>{selection.coupon_code}</b><button aria-label="Remove coupon" disabled={busy || quoting} onClick={() => void updateQuote({ ...selection, coupon_code: null })}>×</button></span>}</div>}
       <details className={styles.rewards}><summary>Use a reward ticket <span aria-hidden>+</span></summary>{ticketError ? <p>Your tickets couldn’t load. <Link href="/tickets">Open ticket wallet ↗</Link></p> : <label>Reward ticket<select value={selection.ticket_id ?? ''} disabled={busy || quoting} onChange={event => void updateQuote({ ...selection, ticket_id: event.target.value || null, coupon_code: null })}><option value="">Choose a ticket</option>{tickets.filter(t => t.revealed_at && !t.used_at && ['percentage_off', 'amount_off'].includes(t.prize?.kind ?? '')).map(ticket => <option key={ticket.id} value={ticket.id}>{ticket.title} · {ticket.prize?.kind === 'percentage_off' ? `${ticket.prize.value}% off` : money(ticket.prize?.value ?? 0) + ' off'}</option>)}</select></label>}<p>One discount per order. <Link href="/tickets">Reveal or claim tickets ↗</Link></p></details>
      </section>
      <form className={styles.reviewForm} onSubmit={event => { event.preventDefault(); void prepare(); }}><fieldset disabled={busy || quoting || loadError}><h2>Billing details</h2><label>Full legal name<input value={name} onChange={event => setName(event.target.value)} autoComplete="name" minLength={2} maxLength={100} required /></label><div className={styles.fieldPair}><label>Billing country<CountryPicker value={country} onChange={setCountry} disabled={busy} /></label><label>State or province<input value={province} onChange={event => setProvince(event.target.value)} autoComplete="address-level1" maxLength={100} required={['US', 'CA'].includes(country)} /></label></div>
       {!free && method === 'card' && <><label>Street address<input value={address} onChange={event => setAddress(event.target.value)} autoComplete="street-address" maxLength={100} required /></label><div className={styles.fieldPair}><label>City<input value={city} onChange={event => setCity(event.target.value)} autoComplete="address-level2" maxLength={40} required /></label><label>Postal or ZIP code<input value={postal} onChange={event => setPostal(event.target.value)} autoComplete="postal-code" maxLength={20} required /></label></div></>}
       {!free && <fieldset className={styles.methods}><legend>Payment method</legend><label data-selected={method === 'card'}><input type="radio" name="method" value="card" checked={method === 'card'} onChange={() => setMethod('card')} /><CardIcon /><strong>Card</strong><span>{cards ? money(payable) : 'Unavailable'}</span></label><label data-selected={method === 'crypto'}><input type="radio" name="method" value="crypto" checked={method === 'crypto'} onChange={() => setMethod('crypto')} /><CryptoIcon /><strong>Crypto</strong><span>{cryptoEnabled ? money(payable) : 'Unavailable'}</span></label></fieldset>}
       <section className={styles.disclaimers} aria-labelledby="before-trading-heading">
        <h2 id="before-trading-heading">Before you trade</h2>
        <div className={styles.disclaimerGrid}>
         <article className={styles.disclaimerCard}><h3>Record your sessions</h3><p>For a smooth evaluation, enable recording when you open your terminal.</p></article>
         <article className={styles.disclaimerCard}><h3>Refunds</h3><p>Once you trade your evaluation, we cannot refund your purchase.</p></article>
         <article className={styles.lossCard}><dl><div><dt>End-of-day MLL <span>Maximum loss limit</span></dt><dd>$1,500 <small>USD</small></dd></div></dl><details><summary>Learn more <span aria-hidden>+</span></summary><p>Your loss limit trails your highest end-of-day balance by $1,500. A new best close raises the floor; a losing day does not lower it. Reaching the floor can end your evaluation.</p><p>For example, a $50,000 starting balance has a $48,500 floor. A $51,000 best end-of-day balance raises that floor to $49,500.</p></details></article>
        </div>
       </section>
       {catalog.terms && <label className={styles.consent}><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} required /><span>I agree to the <a href={catalog.terms.url} target="_blank" rel="noreferrer">evaluation agreement</a> and consent to electronic records.</span></label>}
       {disabledReason && <p className={styles.notice}>{disabledReason} {complianceNeeded ? <Link href="/account/compliance">Complete compliance ↗</Link> : !available ? <Link href="/account">View accounts ↗</Link> : null}</p>}
       <button className={styles.primary} disabled={busy || quoting || !quote || Boolean(disabledReason) || loadError}>{busy ? 'Preparing checkout…' : quoting ? 'Updating total…' : `Continue · ${money(payable)}`} <span aria-hidden>→</span></button>
      </fieldset></form>
      {purchase?.checkout.state === 'open' && <button type="button" className={styles.cancel} disabled={busy} onClick={async () => { if (mutation.current) return; mutation.current = true; setBusy(true); try { await commerce('cancel', { checkout_id: purchase.checkout.id }); if (mounted.current) { setPurchase(null); setAttempt(null); purchaseUrl(); setNotice('Checkout cancelled.'); const nextContext = await commerce<Context>('context'); if (mounted.current) setContext(nextContext); } } catch (error) { if (mounted.current) setError(error instanceof Error ? error.message : 'Couldn’t cancel checkout.'); } finally { mutation.current = false; if (mounted.current) setBusy(false); } }}>Cancel saved checkout</button>}
     </>}
     <div className={styles.help}><span>Need a hand?</span><Link href="/account/support">Contact support ↗</Link></div>
    </div>
   </div>}
   {catalog && <PurchaseHistory />}
  </main>
 </div>;
}

function PurchaseStatus({ purchase, uncertain, checking, check }: { purchase: Purchase; uncertain: boolean; checking: boolean; check: () => Promise<void> }) {
 const paid = purchase.checkout.state === 'paid', cancelled = purchase.checkout.state === 'cancelled', invoice = safeInvoiceUrl(purchase.attempts[0]?.payment_url), crypto = purchase.attempts[0]?.processor === 'crypto';
 const invitation = paid && purchase.requires_acceptance;
 const ready = paid && !invitation && purchase.issuance.length === purchase.revision.quantity && purchase.issuance.every(item => item.account_id);
 return <section className={styles.status} aria-labelledby="status-heading"><div className={styles.statusIcon} data-ready={paid} aria-hidden>{paid ? '✓' : <ClockIcon />}</div><p className={styles.eyebrow}>{cancelled ? 'Checkout cancelled' : paid ? 'Payment confirmed' : crypto && invoice && !uncertain ? 'Crypto invoice ready' : 'Confirmation pending'}</p><h2 id="status-heading">{cancelled ? 'This checkout was cancelled.' : invitation ? 'Finish your trading setup.' : ready ? 'Your evaluation is ready.' : paid ? 'Setting up your evaluation.' : crypto && invoice && !uncertain ? 'Complete your crypto payment.' : 'We’re checking your payment.'}</h2><p className={styles.muted}>{cancelled ? 'Your order wasn’t submitted for payment. You can start a new checkout when you’re ready.' : invitation ? 'Accept your Tradara invitation to finish setting up your evaluation.' : ready ? 'Open your account to see your objectives and trading access.' : paid ? 'Your purchase is confirmed. Each account will appear here as setup finishes.' : crypto && invoice && !uncertain ? 'Follow the amount, coin and network shown on your invoice. This page updates when payment is confirmed.' : 'Your order and discount are held while we confirm the result. You can safely return to this page.'}</p>
 {!paid && invoice && <a className={styles.primary} href={invoice} target="_blank" rel="noreferrer">Open crypto invoice <span aria-hidden>↗</span></a>}
 {paid && <div className={styles.issued}>{Array.from({ length: purchase.revision.quantity }, (_, index) => { const item = purchase.issuance[index], problem = item && ['failed', 'cancelled', 'plan_mapping_required'].includes(item.state), compliance = item?.state === 'compliance_pending'; return <article key={item?.slot_id ?? index}><span className={styles.accountNumber}>{String(index + 1).padStart(2, '0')}</span><div><strong>{purchase.revision.product_label}</strong><p>{item?.account_id ? 'Ready to open' : problem ? 'Setup needs attention' : compliance ? 'Complete compliance' : item?.state === 'unknown' ? 'Confirming account setup' : invitation ? 'Awaiting trading setup' : 'Preparing your account'}</p></div>{item?.account_id ? <Link href={`/account?account=${item.account_id}`} aria-label={`Open evaluation ${index + 1}`}>Open ↗</Link> : problem ? <Link href="/account/support">Get help ↗</Link> : compliance ? <Link href={`/account/compliance?slot=${item.slot_id}`}>Continue ↗</Link> : <span className={styles.waiting} aria-label="Preparing" />}</article>; })}</div>}
 <div className={styles.statusActions}>{!cancelled && (!ready || uncertain) && <button className={styles.secondary} onClick={() => void check()} disabled={checking}>{checking ? 'Checking…' : 'Check status'}</button>}<Link className={paid ? styles.primary : styles.textButton} href={invitation ? `/account/terminal${purchase.issuance[0]?.slot_id ? `?slot=${purchase.issuance[0].slot_id}` : ''}` : purchase.issuance[0]?.slot_id ? `/account?slot=${purchase.issuance[0].slot_id}` : '/account'}>{invitation ? 'Finish trading setup' : 'Back to accounts'} <span aria-hidden>→</span></Link></div><p className={styles.reference}>Order reference <span>{purchase.checkout.id}</span></p></section>;
}
function CardIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><rect x="2.5" y="5" width="19" height="14" rx="3" /><path d="M3 10h18M6 15h4" /></svg>; }
function CryptoIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><circle cx="12" cy="12" r="9" /><path d="m11 5-2 14m5-13-2 14M8 7h6c4 0 4 5 0 5H9m4 0c5 0 4 5 0 5H7" /></svg>; }
function ClockIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></svg>; }

function PurchaseHistory() {
 const [history, setHistory] = useState<OrderHistory | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
 async function load(more = false) { if (busy) return; setBusy(true); setError(''); try { const next = await commerce<OrderHistory>(`history${more && history?.next ? `?before=${encodeURIComponent(history.next)}` : ''}`); setHistory(current => ({ ...next, items: more ? [...current?.items ?? [], ...next.items] : next.items })); } catch { setError('Your purchases couldn’t load. Please try again.'); } finally { setBusy(false); } }
 return <details className={styles.history} onToggle={event => { if (event.currentTarget.open && !history && !busy) void load(); }}><summary>Your purchases <span aria-hidden>+</span></summary>{error && <p role="alert">{error}</p>}{history?.items.map(order => <Link key={order.id} href={`/checkout?checkout=${order.id}`}><span>{new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span><strong>{order.state === 'paid' ? 'Payment confirmed' : order.state === 'pending' ? 'Confirming payment' : order.state === 'cancelled' ? 'Cancelled' : 'Saved checkout'}</strong><span aria-hidden>↗</span></Link>)}{history && !history.items.length && <p>No purchases yet.</p>}{busy && <p role="status">Loading purchases…</p>}{(history?.next || error) && <button className={styles.textButton} disabled={busy} onClick={() => void load(Boolean(history?.next))}>{error ? 'Try again' : 'Load more'}</button>}</details>;
}
