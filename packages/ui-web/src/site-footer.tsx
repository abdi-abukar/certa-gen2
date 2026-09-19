import type { ReactNode } from 'react';
import styles from './site-footer.module.css';

/** Public destinations retained from the original MVP's footer and lib/certa.ts. */
const publicSite = 'https://certafutures.com';
const socialLinks = [
  { name: 'Discord', href: 'https://discord.gg/certa', icon: 'discord' },
  { name: 'X', href: 'https://x.com/certafunding', icon: 'x' },
  { name: 'YouTube', href: 'https://www.youtube.com/@certafutures', icon: 'youtube' },
  { name: 'Instagram', href: 'https://www.instagram.com/certafutures/', icon: 'instagram' },
  { name: 'TikTok', href: 'https://www.tiktok.com/@certafutures', icon: 'tiktok' },
] as const;
const policies = [
  ['Terms of Service', 'terms'], ['Privacy Policy', 'privacy'], ['Billing', 'billing'],
  ['Refund Policy', 'refund'], ['Cookies', 'cookies'], ['Evaluation Agreement', 'evaluation-agreement'],
] as const;

function SocialIcon({ name }: { name: typeof socialLinks[number]['icon'] }) {
  const paths: Record<typeof name, ReactNode> = {
    discord: <><path d="M8 5 5 6C3 9 2 12 3 16l4 2 1-2m8-11 3 1c2 3 3 6 2 10l-4 2-1-2M7 8c3-2 7-2 10 0M7 15c3 2 7 2 10 0" /><circle cx="8.5" cy="12" r="1" /><circle cx="15.5" cy="12" r="1" /></>,
    x: <path d="M4 4h4l12 16h-4L4 4Zm15 0-6 7m-2 2-7 7" />,
    youtube: <><rect x="3" y="5" width="18" height="14" rx="4" /><path d="m10 9 5 3-5 3V9Z" /></>,
    instagram: <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r=".6" fill="currentColor" /></>,
    tiktok: <path d="M14 3v12a4 4 0 1 1-4-4m4-8c0 4 3 6 6 6V6c-2 0-3-1-3-3h-3Z" />,
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export function SiteFooter({ customerOrigin = '', newsletter }: { customerOrigin?: string; newsletter?: ReactNode }) {
  const customer = (path: string) => `${customerOrigin.replace(/\/$/, '')}${path}`;
  const groups = [
    { title: 'Product', links: [
      ['Evaluation', customer('/#account-plan')], ['Account rules', `${publicSite}/rules`],
      ['Funded account rules', `${publicSite}/rules#paths`], ['Maximum drawdown', `${publicSite}/rules#max-drawdown`],
      ['Pricing', customer('/checkout')], ['Claim a ticket', customer('/tickets')],
    ] },
    { title: 'Company', links: [
      ['About Certa', `${publicSite}/why`], ['Certa Sundays', `${publicSite}/sundays`],
      ['Certa Rewards', `${publicSite}/rewards`], ['Affiliates', `${publicSite}/affiliates`],
      ['Newsletter', `${publicSite}/newsletter`],
    ] },
    { title: 'Support', links: [
      ['Customer support', customer('/account/support')], ['Contact support', 'mailto:support@certafutures.com'],
      ['Discord', socialLinks[0].href], ['Report a bug', `${publicSite}/status`],
      ['System status', `${publicSite}/status`], ['All policies', `${publicSite}/legal`],
    ] },
  ];
  return <footer className={styles.footer} aria-label="Certa Futures footer">
    <div className={styles.top}>
      <section className={styles.brand} aria-label="About Certa Futures">
        <a href={customer('/')} className={styles.logoLink} aria-label="Certa Futures home"><img className={styles.logo} src="/brand/certa-footer-logo.webp" alt="" width="275" height="110" loading="lazy" /></a>
        <h2>A simpler path for<br />serious traders.</h2>
        <p>Fair rules. Real opportunities.<br />A trading community built<br />to go further.</p>
        <nav className={styles.socials} aria-label="Certa social channels">{socialLinks.map(link => <a key={link.name} href={link.href} aria-label={`${link.name} (opens in a new tab)`} title={link.name} target="_blank" rel="noopener noreferrer"><SocialIcon name={link.icon} /></a>)}</nav>
      </section>
      {groups.map(group => <nav key={group.title} className={styles.column} aria-label={`Footer ${group.title.toLowerCase()}`}>
        <h3>{group.title}</h3><ul>{group.links.map(([label, href]) => <li key={label}><a href={href}>{label}</a></li>)}</ul>
      </nav>)}
      <section id="certa-newsletter" className={styles.newsletter} aria-label="Certa newsletter">
        <div><p className={styles.eyebrow}>Join our journey</p><h2>Get the latest from Certa.</h2><p>Product updates, trading insights, community events and more. No spam, just the stuff that matters.</p></div>
        {newsletter ?? <div className={styles.newsletterEntry}><a className={styles.subscribeLink} href={customer('/#certa-newsletter')}>Subscribe on Certa <span aria-hidden="true">→</span></a><p>Manage your subscription with your Certa account.</p></div>}
      </section>
    </div>
    <div className={styles.legal}>
      <nav aria-label="Footer legal policies">{policies.map(([label, slug]) => <a key={slug} href={`${publicSite}/legal/${slug}`}>{label}</a>)}</nav>
      <p>Certa Futures provides paid access to simulated futures evaluations. All account balances, orders, executions, profits, and losses are simulated; customer funds are not deposited into a brokerage account or used to trade live markets. Certa Futures is not a broker, futures commission merchant, commodity trading adviser, investment adviser, bank, exchange, or fiduciary. Passing an evaluation does not guarantee a reward. Rewards are subject to the published program rules, eligibility requirements, identity verification, and compliance review. Simulated results have inherent limitations, do not represent actual trading, and do not predict future results. Futures trading involves substantial risk. Nothing on this site is investment, legal, or tax advice.</p>
      <small>© {new Date().getFullYear()} Certa Futures. All rights reserved.</small>
    </div>
    <div className={styles.art} aria-hidden="true"><img src="/brand/certa-footer-landscape.webp" alt="" width="1536" height="594" loading="lazy" decoding="async" /></div>
  </footer>;
}
