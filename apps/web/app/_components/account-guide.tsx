'use client';

import { AuthDialogLink } from './auth-dialog';

import { useRef, type CSSProperties, type KeyboardEvent } from 'react';
import styles from './account-guide.module.css';

// Public design-preview copy, adapted from the parent account guide.
// This is not the plan registry or a source of checkout/eligibility decisions.
const chapters = [
  { id: 'evaluation', name: 'Evaluation', hint: 'Your starting point', title: 'A clear target. Room to get there.', description: 'One simulated evaluation. Know your target, understand your risk, and trade at your own pace.', amount: '$50,000', amountLabel: 'Simulated starting balance', facts: [['Profit target', '$3,000'], ['EOD trailing drawdown', '$1,500'], ['Position size', '5 minis / 50 micros'], ['Time limit', 'None'], ['Evaluation fee', '$150 one time'], ['Minimum trading days', '1 eligible day']], note: 'One eligible trading day can be enough. Meeting the target is subject to the account rules and a confirmed evaluation pass.', x: '17%', y: '70%' },
  { id: 'funded', name: 'Certified Funded', hint: 'What comes after', title: 'Your next chapter starts at zero.', description: 'After a confirmed pass and the required checks, your simulated funded account starts at $0. Build qualifying days toward a payout.', amount: '$0', amountLabel: 'Simulated funded starting balance', facts: [['Qualifying days per cycle', '5 at +$250 or more'], ['Eligible balance per request', '50%'], ['First payout range', '$250–$1,000'], ['Later payout range', '$250–$2,000']], note: 'KYC, tax documents and the funded agreement are required. Payouts remain subject to balance requirements, eligibility and review.', x: '32%', y: '56%' },
  { id: 'drawdown', name: 'Max Drawdown', hint: 'Know your room', title: 'Understand the floor beneath you.', description: 'The trailing floor follows your highest end-of-day balance. A new best close moves it up; a losing day does not move it down.', amount: '$1,500', amountLabel: 'Below your highest end-of-day balance', facts: [['Updated', 'At the end of day'], ['New best close', 'Floor moves up'], ['Losing day', 'Floor stays put'], ['Approved payout', 'Floor moves down with it']], note: 'Illustration: a $51,000 best end-of-day balance places the floor at $49,500. Reaching the floor can end the account.', x: '47%', y: '46%' },
  { id: 'firm', name: 'Firm Rules', hint: 'The ground rules', title: 'Less to work around. More clarity.', description: 'The essentials, in plain sight. These are the everyday parameters around the evaluation and funded account.', amount: '3', amountLabel: 'Concurrent account slots, subject to verification', facts: [['Consistency rule', 'None'], ['Separate daily loss limit', 'None'], ['Funded activation fee', '$0'], ['News trading', 'Allowed']], note: 'Account limits, identity checks and fair-trading rules still apply. Required verification depends on your account stage and number of accounts.', x: '47%', y: '29%' },
] as const;

export function AccountGuide({ active, onChapterChange: setActive }: { active: number; onChapterChange: (index: number) => void }) {
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const chapter = chapters[active];

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % chapters.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index + chapters.length - 1) % chapters.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = chapters.length - 1;
    else return;
    event.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  }

  return <section id="account-plan" className={styles.guide} aria-labelledby="account-plan-heading">
    <div className={styles.inner}>
      <div className={styles.heading}>
        <h2 id="account-plan-heading" tabIndex={-1}>One account.<br />The whole picture.</h2>
        <div><span className={styles.preview}>Account guide preview</span><p>Get to know the evaluation, what follows, and the rules along the way. Choose a chapter to look closer.</p></div>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Account guide chapters">
        {chapters.map((item, index) => <button key={item.id} type="button" role="tab"
          id={`account-tab-${item.id}`} aria-controls={`account-panel-${item.id}`} aria-selected={active === index}
          tabIndex={active === index ? 0 : -1} ref={element => { tabs.current[index] = element; }}
          onClick={() => setActive(index)} onKeyDown={event => onKeyDown(event, index)}>
          <span className={styles.number}>{String(index + 1).padStart(2, '0')}</span>
          <span><strong>{item.name}</strong><small>{item.hint}</small></span>
          <span className={styles.tabArrow} aria-hidden="true">↗</span>
        </button>)}
      </div>

      <div className={styles.content}>
        <div className={styles.map} aria-hidden="true">
          <div className={styles.mapCaption}><span>Certa field guide</span><span>0{active + 1} / 04</span></div>
          <div className={styles.world}>
            <div className={styles.character} style={{ '--character-x': chapter.x, '--character-y': chapter.y } as CSSProperties} />
            <span className={styles.flag}><i />C</span>
            <span className={styles.mapCompass}>N ↑</span>
          </div>
          <div className={styles.mapLegend}><span className={styles.marker} />{chapter.hint}<span>0{active + 1}</span></div>
        </div>

        <div className={styles.panels}>
          {chapters.map((item, index) => <div key={item.id} role="tabpanel" tabIndex={0}
            id={`account-panel-${item.id}`} aria-labelledby={`account-tab-${item.id}`}
            hidden={active !== index} className={styles.panel}>
            <h3>{item.title}</h3>
            <p className={styles.description}>{item.description}</p>
            <div className={styles.balance}><strong>{item.amount}</strong><span>{item.amountLabel}</span></div>
            <dl className={styles.facts}>{item.facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
            <p className={styles.note}>{item.note}</p>
          </div>)}
        </div>
      </div>

      <div className={styles.bottom}>
        <p>All trading is simulated. Eligibility and program rules apply.</p>
        <AuthDialogLink mode="signup" data-action="primary">Create your Certa profile <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M3 9h11m-4-4 4 4-4 4" /></svg></AuthDialogLink>
      </div>
    </div>
  </section>;
}
