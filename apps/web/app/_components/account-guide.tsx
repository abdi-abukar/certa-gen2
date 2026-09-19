'use client';

import { AuthDialogLink } from './auth-dialog';

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import styles from './account-guide.module.css';

// Public design-preview copy, adapted from the parent account guide.
// This is not the plan registry or a source of checkout/eligibility decisions.
const chapters = [
  { id: 'evaluation', name: 'Evaluation', hint: 'Your starting point', description: 'One simulated evaluation. Know your target, understand your risk, and trade at your own pace.', amount: '$50,000', amountLabel: 'Simulated starting balance', facts: [['Profit target', '$3,000'], ['EOD trailing drawdown', '$1,500'], ['Position size', '5 minis / 50 micros'], ['Time limit', 'None'], ['Evaluation fee', '$150 one time'], ['Minimum trading days', '1 eligible day']], note: 'One eligible trading day can be enough. Meeting the target is subject to the account rules and a confirmed evaluation pass.' },
  { id: 'funded', name: 'Certified Funded', hint: 'What comes after', description: 'After a confirmed pass and the required checks, your simulated funded account starts at $0. Build qualifying days toward a payout.', amount: '$0', amountLabel: 'Simulated funded starting balance', facts: [['Qualifying days per cycle', '5 at +$250 or more'], ['Eligible balance per request', '50%'], ['First payout range', '$250–$1,000'], ['Later payout range', '$250–$2,000']], note: 'KYC, tax documents and the funded agreement are required. Payouts remain subject to balance requirements, eligibility and review.' },
  { id: 'drawdown', name: 'Max Drawdown', hint: 'Know your room', description: 'The trailing floor follows your highest end-of-day balance. A new best close moves it up; a losing day does not move it down.', amount: '$1,500', amountLabel: 'Below your highest end-of-day balance', facts: [['Updated', 'At the end of day'], ['New best close', 'Floor moves up'], ['Losing day', 'Floor stays put'], ['Approved payout', 'Floor moves down with it']], note: 'Illustration: a $51,000 best end-of-day balance places the floor at $49,500. Reaching the floor can end the account.' },
  { id: 'firm', name: 'Firm Rules', hint: 'The ground rules', description: 'The essentials, in plain sight. These are the everyday parameters around the evaluation and funded account.', amount: '3', amountLabel: 'Concurrent account slots, subject to verification', facts: [['Consistency rule', 'None'], ['Separate daily loss limit', 'None'], ['Funded activation fee', '$0'], ['News trading', 'Allowed']], note: 'Account limits, identity checks and fair-trading rules still apply. Required verification depends on your account stage and number of accounts.' },
] as const;

const evaluationHighlights = [
  { value: '$3,000', label: 'Profit target', description: 'Reach the target while following the account rules. A pass must be confirmed.' },
  { value: '$1,500', label: 'EOD trailing drawdown', description: 'Your drawdown floor trails your best end-of-day balance by $1,500.' },
  { value: '5 minis / 50 micros', label: 'Max position', description: 'The maximum position size at any one time.' },
] as const;

// Walk duration for the stage character; matches the CSS transition.
const WALK_MS = 420;

function Arrow({ back = false }: { back?: boolean }) {
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <path d={back ? 'M15 9H4m4-4L4 9l4 4' : 'M3 9h11m-4-4 4 4-4 4'} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

function RuleMark({ kind }: { kind: 'clock' | 'calendar' | 'check' }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'clock' ? <><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></>
      : kind === 'calendar' ? <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 10h18m-11 5 3 3 5-5" /></>
        : <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>}
  </svg>;
}

export function AccountGuide({ active, onChapterChange: setActive }: { active: number; onChapterChange: (index: number) => void }) {
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const trail = useRef<HTMLDivElement>(null);
  const previous = useRef(active);
  const [facing, setFacing] = useState<'left' | 'right'>('right');
  const [walking, setWalking] = useState(false);

  useEffect(() => {
    // Reveal the selected stage inside the scrollable trail without moving the page.
    const list = trail.current;
    const tab = tabs.current[active];
    if (!list || !tab || list.scrollWidth <= list.clientWidth) return;
    list.scrollTo({ left: tab.offsetLeft - (list.clientWidth - tab.clientWidth) / 2,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }, [active]);

  useEffect(() => {
    // Walk the character to the chosen stage; reduced motion moves it instantly.
    const from = previous.current;
    previous.current = active;
    if (from === active || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setFacing(active > from ? 'right' : 'left');
    setWalking(true);
    const timer = window.setTimeout(() => setWalking(false), WALK_MS);
    return () => window.clearTimeout(timer);
  }, [active]);

  function select(index: number, focus = false) {
    setActive(index);
    if (focus) tabs.current[index]?.focus({ preventScroll: true });
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % chapters.length;
    else if (event.key === 'ArrowLeft') next = (index + chapters.length - 1) % chapters.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = chapters.length - 1;
    else return;
    event.preventDefault();
    select(next, true);
  }

  const nextChapter = chapters[active + 1];

  return <section id="account-plan" className={styles.guide} aria-labelledby="account-plan-heading">
    <div className={styles.inner}>
      <header className={styles.heading}>
        <div><h2 id="account-plan-heading" tabIndex={-1}>One account. Clear rules.</h2>
          <p>The numbers and rules you need before you start.</p></div>
        <p className={styles.counter} aria-live="polite">Stage <strong>{active + 1}</strong> of {chapters.length}</p>
      </header>

      <nav className={styles.stages} aria-label="Account guide stages">
        <div ref={trail} className={styles.trailScroll}>
          <div className={styles.trail} style={{ '--stage': active, '--stages': chapters.length } as CSSProperties}>
            <span className={styles.path} aria-hidden="true"><span className={styles.pathDone} /></span>
            <span className={styles.character} data-facing={facing} data-walking={walking} aria-hidden="true" />
            <div className={styles.tabs} role="tablist" aria-label="Account guide sections" aria-orientation="horizontal">
              {chapters.map((item, index) => <button key={item.id} type="button" role="tab"
                id={`account-tab-${item.id}`} aria-controls={`account-panel-${item.id}`} aria-selected={active === index}
                data-reached={index <= active} tabIndex={active === index ? 0 : -1} ref={element => { tabs.current[index] = element; }}
                onClick={() => select(index)} onKeyDown={event => onKeyDown(event, index)}>
                <span className={styles.node}>{index + 1}</span>
                <strong>{item.name}</strong>
                <small>{item.hint}</small>
              </button>)}
            </div>
          </div>
        </div>
      </nav>

      <div className={styles.content}>
        {chapters.map((item, index) => <div key={item.id} role="tabpanel" tabIndex={0}
          id={`account-panel-${item.id}`} aria-labelledby={`account-tab-${item.id}`}
          hidden={active !== index} className={styles.panel}>
          {index === 0 ? <>
            <h3 className={styles.srOnly}>Evaluation rules</h3>
            <div className={styles.summary}>
              <div className={styles.balance}><strong>$50,000</strong><span>Simulated evaluation account</span></div>
              <div className={styles.price}>
                <div className={styles.priceAmounts}><s><span className={styles.srOnly}>Regular price </span>$150</s><strong>$120</strong></div>
                <span>One-time evaluation fee with 20% off</span>
                <span className={styles.coupon}><span className={styles.couponMark} aria-hidden="true">?</span>Mystery coupon · 20% off minimum</span>
                <p className={styles.couponNote}>Reveal your discount at checkout. You could save even more.</p>
              </div>
            </div>

            <dl className={styles.highlights}>{evaluationHighlights.map(fact => <div key={fact.label}>
              <dt>{fact.label}</dt><dd>{fact.value}</dd><dd className={styles.explanation}>{fact.description}
                {fact.label === 'EOD trailing drawdown' && <button className={styles.learnMore} type="button" aria-controls="account-panel-drawdown" aria-label="Learn more about max drawdown" onClick={() => select(2, true)}>Learn more <Arrow /></button>}
              </dd>
            </div>)}</dl>

            <figure className={styles.run}>
              <figcaption>Your run, from the $50,000 start. Illustration only.</figcaption>
              <div className={styles.runTrack} aria-hidden="true">
                <span className={styles.runRoom} /><span className={styles.runClimb} />
                <span className={`${styles.runMark} ${styles.runFloor}`} />
                <span className={`${styles.runMark} ${styles.runStart}`} />
                <span className={`${styles.runMark} ${styles.runTarget}`} />
              </div>
              <ul className={styles.runLabels}>
                <li><strong>$48,500</strong><span>Floor, $1,500 below</span></li>
                <li><strong>$50,000</strong><span>Start</span></li>
                <li><strong>$53,000</strong><span>Target, $3,000 above</span></li>
              </ul>
            </figure>

            <div className={styles.ruleGroups}>
              <div><h4>Evaluation rules</h4><ul className={styles.ruleList}>
                <li><RuleMark kind="clock" /><div><strong>No time limit</strong><p>Trade at your own pace.</p></div></li>
                <li><RuleMark kind="calendar" /><div><strong>1 eligible trading day</strong><p>The minimum required before a confirmed pass.</p></div></li>
              </ul></div>
              <div><h4>Additional firm rules</h4><ul className={styles.ruleList}>
                {chapters[3].facts.map(([label, value]) => <li key={label}><RuleMark kind="check" /><div>
                  <strong>{label === 'News trading' ? 'News trading allowed' : value === 'None' ? `No ${label.toLowerCase()}` : '$0 funded activation fee'}</strong>
                </div></li>)}
              </ul></div>
            </div>
          </> : <>
            <h3>{item.name}</h3>
            <p className={styles.description}>{item.description}</p>
            <div className={styles.summary}><div className={styles.balance}><strong>{item.amount}</strong><span>{item.amountLabel}</span></div></div>
            <dl className={styles.facts}>{item.facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
            <p className={styles.note}>{item.note}</p>
          </>}
        </div>)}

        <div className={styles.stageActions}>
          <button className={styles.stageButton} type="button" disabled={active === 0} onClick={() => select(active - 1, true)}>
            <Arrow back /><span>Previous stage</span>
          </button>
          {nextChapter ? <button className={`${styles.stageButton} ${styles.stageNext}`} type="button" onClick={() => select(active + 1, true)}>
            <span><small>Next stage</small>{nextChapter.name}</span><Arrow />
          </button> : <p className={styles.stageEnd}>You’ve seen every stage.</p>}
        </div>
      </div>

      <div className={styles.bottom}>
        <AuthDialogLink mode="signup" data-action="primary">Get started <Arrow /></AuthDialogLink>
        <p>Account guide preview. All trading is simulated.<br />Eligibility and program rules apply.</p>
      </div>
    </div>
  </section>;
}
