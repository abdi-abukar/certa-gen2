'use client';
import { useEffect, useRef, useState } from 'react';
import { money, type Attempt, type Processor, type Token } from './model';
import styles from './checkout.module.css';

type GatewayWindow = Window & {
 CollectJS?: { configure(options: Record<string, unknown>): void; startPaymentRequest(): void };
 Accept?: { dispatchData(data: unknown, callback: (response: { messages?: { resultCode: string }; opaqueData?: Token }) => void): void };
};
function loadScript(src: string, key?: string) {
 return new Promise<void>((resolve, reject) => {
  const existing = Array.from(document.scripts).find(script => script.src === src);
  if (existing?.dataset.ready === 'true') { resolve(); return; }
  const script = existing ?? document.createElement('script');
  const timeout = window.setTimeout(() => { cleanup(); if (!existing) script.remove(); reject(new Error('Secure card fields couldn’t load. Check your connection and try again.')); }, 15000);
  function cleanup() { clearTimeout(timeout); script.removeEventListener('load', loaded); script.removeEventListener('error', failed); }
  function loaded() { cleanup(); script.dataset.ready = 'true'; resolve(); }
  function failed() { cleanup(); script.remove(); reject(new Error('Secure card fields couldn’t load. Check your connection and try again.')); }
  script.addEventListener('load', loaded); script.addEventListener('error', failed);
  if (!existing) { script.src = src; if (key) script.dataset.tokenizationKey = key; document.head.appendChild(script); }
 });
}
export function SecurePayment({ attempt, config, total, busy, pay, onBack }: { attempt: Attempt; config?: Processor; total: number; busy: boolean; pay: (token: Token) => Promise<void>; onBack: () => void }) {
 const [ready, setReady] = useState(false), [tokenizing, setTokenizing] = useState(false), [error, setError] = useState(''), [generation, setGeneration] = useState(0);
 const epoch = useRef(''); epoch.current = `${attempt.id}:${generation}`;
 const armed = useRef(false), alive = useRef(true), submitToken = useRef(pay), timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
 submitToken.current = pay;
 const free = total === 0, crypto = attempt.processor === 'crypto';
 useEffect(() => {
  alive.current = true; let active = true; setReady(false); setError(''); armed.current = false;
  if (free || crypto) { setReady(true); return () => { alive.current = false; }; }
  if (!config?.scriptUrl) { setError('Secure payment isn’t available. Return to your order to choose a payment method.'); return; }
  const win = window as GatewayWindow;
  let available = false;
  const fieldsTimeout = setTimeout(() => { if (active && !available) { setReady(false); setError('Secure card fields couldn’t connect. Reload the fields to try again.'); } }, 20000);
  loadScript(config.scriptUrl, config.tokenizationKey).then(() => {
   if (!active) return;
   if (attempt.processor === 'nmi') {
    if (!win.CollectJS) throw new Error('Secure card fields couldn’t load. Please try again.');
    win.CollectJS.configure({ variant: 'inline', blockEval: true, currency: 'USD', price: (total / 100).toFixed(2), fields: { ccnumber: { selector: '#checkout-card-number', title: 'Card number', placeholder: 'Card number' }, ccexp: { selector: '#checkout-card-expiry', title: 'Expiry', placeholder: 'MM / YY' }, cvv: { selector: '#checkout-card-security', title: 'Security code', placeholder: 'CVC' } }, styleSniffer: false, customCss: { 'font-size': '16px', color: '#17221b', 'font-family': 'Arial, sans-serif' },
     fieldsAvailableCallback: () => { if (active) { available = true; clearTimeout(fieldsTimeout); setError(''); setReady(true); } }, timeoutDuration: 15000,
     timeoutCallback: () => { if (active && armed.current) fail('Card verification timed out. Reload the card fields to try again.'); },
     validationCallback: (_field: string, valid: boolean) => { if (active && !valid && armed.current) fail('Check your card details and try again.'); },
     callback: (response: { token?: string }) => { if (!active || !armed.current) return; if (!response.token) { fail('Card details couldn’t be verified. Please try again.'); return; } finish({ paymentToken: response.token }); },
    });
   } else { if (!win.Accept) throw new Error('Secure card fields couldn’t load. Please try again.'); available = true; clearTimeout(fieldsTimeout); setReady(true); }
  }).catch(error => { if (active) setError(error.message); });
  function fail(message: string) { armed.current = false; if (timeout.current) clearTimeout(timeout.current); setTokenizing(false); setReady(false); setError(message); }
  function finish(token: Token) { armed.current = false; if (timeout.current) clearTimeout(timeout.current); setTokenizing(false); void submitToken.current(token); }
  return () => { active = false; clearTimeout(fieldsTimeout); alive.current = false; armed.current = false; if (timeout.current) clearTimeout(timeout.current); };
 }, [attempt.id, attempt.processor, config, total, free, crypto, generation]);
 return <section className={styles.payment} aria-labelledby="payment-heading"><button className={styles.back} type="button" onClick={onBack} disabled={busy || tokenizing}>← Review order</button><h2 id="payment-heading">{free ? 'Your evaluation is covered.' : crypto ? 'Pay with crypto.' : 'Your card details.'}</h2><p className={styles.muted}>{free ? 'Confirm your order to start account setup.' : crypto ? 'Choose your coin and network on the secure invoice.' : 'Your payment details are encrypted and securely processed.'}</p>
 <form onSubmit={event => {
  event.preventDefault(); if (busy || armed.current || !ready) return;
  if (free || crypto) { void pay({}); return; }
  armed.current = true; setTokenizing(true); setError('');
  timeout.current = setTimeout(() => { if (alive.current && armed.current) { armed.current = false; setTokenizing(false); setReady(false); setError('Card verification timed out. Reload the fields to try again.'); } }, 16000);
  const win = window as GatewayWindow;
  if (attempt.processor === 'nmi') { win.CollectJS?.startPaymentRequest(); return; }
  const form = event.currentTarget, fields = new FormData(form), submittedEpoch = epoch.current;
  win.Accept?.dispatchData({ authData: { apiLoginID: config?.apiLoginId, clientKey: config?.clientKey }, cardData: { cardNumber: String(fields.get('number')).replaceAll(' ', ''), month: fields.get('month'), year: fields.get('year'), cardCode: fields.get('cvv') } }, response => {
   if (!alive.current || !armed.current || submittedEpoch !== epoch.current) return; armed.current = false; if (timeout.current) clearTimeout(timeout.current); setTokenizing(false);
   if (response.messages?.resultCode !== 'Ok' || !response.opaqueData) { setError('Card details couldn’t be verified. Check the fields and try again.'); return; }
   form.reset(); void submitToken.current(response.opaqueData);
  });
 }}>
 {!free && !crypto && <fieldset disabled={busy || tokenizing} className={styles.cardFields} key={generation}>
 {attempt.processor === 'nmi' ? <><div><span className={styles.fieldLabel}>Card number</span><div id="checkout-card-number" className={styles.hosted} /></div><div className={styles.fieldPair}><div><span className={styles.fieldLabel}>Expiry</span><div id="checkout-card-expiry" className={styles.hosted} /></div><div><span className={styles.fieldLabel}>Security code</span><div id="checkout-card-security" className={styles.hosted} /></div></div></> : <><label>Card number<input name="number" autoComplete="cc-number" inputMode="numeric" pattern="[0-9 ]{12,23}" maxLength={23} required /></label><div className={styles.fieldPair}><label>Expiry month<input name="month" autoComplete="cc-exp-month" inputMode="numeric" placeholder="MM" pattern="0?[1-9]|1[0-2]" maxLength={2} required /></label><label>Expiry year<input name="year" autoComplete="cc-exp-year" inputMode="numeric" placeholder="YYYY" pattern="[0-9]{4}" maxLength={4} required /></label></div><label>Security code<input name="cvv" autoComplete="cc-csc" inputMode="numeric" pattern="[0-9]{3,4}" maxLength={4} required /></label></>}
 </fieldset>}
 {error && <div className={styles.error} role="alert">{error}{!ready && <button type="button" className={styles.textButton} onClick={() => setGeneration(value => value + 1)}>Reload card fields</button>}</div>}
 <button className={styles.primary} disabled={busy || tokenizing || !ready}>{busy ? 'Confirming payment…' : tokenizing ? 'Verifying card…' : !ready ? 'Loading secure fields…' : free ? 'Confirm free order' : crypto ? `Continue with crypto · ${money(total)}` : `Pay ${money(total)} USD`} <span aria-hidden>→</span></button>
 </form><p className={styles.footnote}>One-time evaluation purchase.</p></section>;
}
