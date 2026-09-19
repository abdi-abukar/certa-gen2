'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { accountApi } from '../dashboard-api';
import styles from './evaluations.module.css';

type Product = { id: string; label: string; price_cents: number; enabled: boolean };
type Catalog = { products: Product[] };
type CurrentCheckout = { checkout: { id: string; state: string } } | null;

function Arrow() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6" /></svg>;
}

export function Evaluations() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [current, setCurrent] = useState<CurrentCheckout>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    accountApi<Catalog>('/api/commerce/catalog', { signal: controller.signal }).then(catalog => {
      if (controller.signal.aborted) return;
      if (!Array.isArray(catalog.products) || catalog.products.some(product => typeof product.id !== 'string' || typeof product.label !== 'string' || !Number.isSafeInteger(product.price_cents) || product.price_cents < 0)) throw new Error('Catalog unavailable');
      setProducts(catalog.products.filter(product => product.enabled));
    }).catch(() => { if (!controller.signal.aborted) { setProducts(null); setError('Evaluation prices are unavailable right now. Please try again.'); } });
    accountApi<CurrentCheckout>('/api/commerce/current', { signal: controller.signal }).then(value => { if (!controller.signal.aborted) setCurrent(value); }).catch(() => { /* A saved checkout is optional when browsing prices. */ });
    return () => controller.abort();
  }, [revision]);
  const saved = current && !['paid', 'cancelled'].includes(current.checkout.state);

  return <section className={styles.page}>
    <Link className={styles.back} href="/account"><span aria-hidden="true">←</span>Back to overview</Link>
    <div className={styles.heading}><div><h1>Evaluation pricing</h1><p>One-time evaluation fees. All prices in USD.</p></div><Link className={styles.guideLink} href="/#account-plan">Account guide<Arrow /></Link></div>
    {saved && <div className={styles.savedCheckout}><div><strong>Your checkout is saved</strong><p>{current.checkout.state === 'pending' ? 'Your payment is being confirmed.' : 'Pick up where you left off.'}</p></div><Link className={styles.secondary} href="/checkout">Continue checkout<Arrow /></Link></div>}
    {error ? <div className={styles.empty} role="alert"><h2>Prices are temporarily unavailable</h2><p>{error}</p><button className={styles.secondary} type="button" onClick={() => setRevision(value => value + 1)}>Try again</button></div>
      : !products ? <div className={styles.loading} role="status">Loading evaluation prices…</div>
        : products.length === 0 ? <div className={styles.empty}><h2>No evaluations are available right now</h2><p>Check back here for current pricing and availability.</p><button className={styles.secondary} type="button" onClick={() => setRevision(value => value + 1)}>Check availability</button></div>
          : <div className={styles.products} aria-label="Available evaluations">{products.map(product => <article className={styles.product} key={product.id}>
            <div className={styles.productName}><span className={styles.productMark} aria-hidden="true"><svg width="28" height="28" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m3 26 10-17 6 9 3-4 7 12H3Zm7-12 3 3 3-3m4-9v7m0-7h7l-2 2 2 2h-7" /></svg></span><div><h2>{product.label}</h2><p>Evaluation account</p></div></div>
            <div className={styles.price}><strong>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: product.price_cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 }).format(product.price_cents / 100)}</strong><span>One-time fee</span></div>
            <Link className={styles.primary} href={`/checkout?product=${encodeURIComponent(product.id)}`} aria-label={`Choose ${product.label}`}>Choose evaluation<Arrow /></Link>
          </article>)}</div>}
    <div className={styles.guidance}><div><h2>Know the rules before you start.</h2><p>Read the evaluation targets, drawdown rules and funded account requirements in the account guide.</p><Link className={styles.guideLink} href="/#account-plan">Read the account guide<Arrow /></Link></div><div className={styles.purchaseNote}><h3>At checkout</h3><p>Your available account slots, verification requirements and any discount are checked before payment.</p><Link className={styles.guideLink} href="/account/support">Questions? Contact support<Arrow /></Link></div></div>
  </section>;
}
