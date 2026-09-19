'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AccountMenu, type AccountPerson } from '@certa/ui-web/account-menu';
import { PageMasthead } from '@certa/ui-web/page-masthead';
import styles from './customer-masthead.module.css';

export function CustomerMasthead({ person, accounts = false }: { person: AccountPerson; accounts?: boolean }) {
  const router = useRouter();
  const firstName = person.name?.trim().split(/\s+/)[0];
  const name = firstName || (person.username?.trim() ? `@${person.username.trim().replace(/^@/, '')}` : null);
  const Heading = accounts ? 'h1' : 'p';

  return <PageMasthead className={accounts ? styles.accountMasthead : undefined}>
    <div className={styles.welcome}>
      <AccountMenu person={person} variant="portrait" LinkComponent={Link} onSaved={() => router.refresh()} />
      <div className={styles.copy}>
        <p className={styles.eyebrow}>{accounts ? 'Accounts' : 'Your trading day'}</p>
        <Heading className={styles.greeting}>Welcome back{name ? <>, <span>{name}.</span></> : '.'}</Heading>
        <p className={styles.description}>Pick up where you left off.</p>
      </div>
    </div>
  </PageMasthead>;
}
