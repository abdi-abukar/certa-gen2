import type { ReactNode } from 'react';
import styles from './page-masthead.module.css';

/** Decorative artwork supplied in certa_masthead_component; no font or script dependency. */
export function PageMasthead({ className = '', children }: { className?: string; children?: ReactNode }) {
  return <div className={`${styles.masthead} ${children ? styles.withContent : ''} ${className}`} aria-hidden={children ? undefined : true}>
    {children && <div className={styles.content}>{children}</div>}
    <div className={styles.art} aria-hidden="true"><img src="/brand/certa-masthead-brand.png" width={375} height={117} alt="" draggable={false} /></div>
  </div>;
}
