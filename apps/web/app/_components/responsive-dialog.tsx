'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './responsive-dialog.module.css';

let locks = 0;
let restoreScroll: (() => void) | undefined;

function lockScroll() {
  if (locks++ === 0) {
    const body = document.body;
    const { position, top, left, width, overflow } = body.style;
    const x = window.scrollX;
    const y = window.scrollY;
    Object.assign(body.style, { position: 'fixed', top: `${-y}px`, left: `${-x}px`, width: '100%', overflow: 'hidden' });
    restoreScroll = () => {
      Object.assign(body.style, { position, top, left, width, overflow });
      window.scrollTo({ left: x, top: y, behavior: 'instant' });
    };
  }
  return () => { if (--locks === 0) { restoreScroll?.(); restoreScroll = undefined; } };
}

/** Mount when needed; onClose fires after the exit animation finishes. */
type DialogProps = {
  title: string;
  description?: string;
  children: ReactNode;
  artwork?: ReactNode;
  mobileArtwork?: 'hidden' | 'strip';
  contentSized?: boolean;
  onClose: () => void;
};

export function ResponsiveDialog(props: DialogProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? createPortal(<DialogSurface {...props} />, document.body) : null;
}

function DialogSurface({ title, description, children, artwork, mobileArtwork = 'hidden', contentSized = false, onClose }: DialogProps) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [closing, setClosing] = useState(false);
  const closeCallback = useRef(onClose);
  closeCallback.current = onClose;

  useEffect(() => {
    const element = dialog.current!;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const unlock = lockScroll();
    element.showModal();
    // Focus the heading, not an input: opening a sheet must not summon the keyboard.
    heading.current?.focus({ preventScroll: true });
    const viewport = window.visualViewport;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        element.style.setProperty('--dialog-viewport-height', `${viewport?.height ?? window.innerHeight}px`);
        element.style.setProperty('--dialog-viewport-top', `${viewport?.offsetTop ?? 0}px`);
      });
    };
    update();
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      element.close();
      unlock();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    if (!closing) return;
    const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 160;
    const timer = window.setTimeout(() => closeCallback.current(), delay);
    return () => window.clearTimeout(timer);
  }, [closing]);

  return <dialog ref={dialog} className={styles.dialog} data-closing={closing} data-artwork={Boolean(artwork)} data-mobile-artwork={mobileArtwork} data-content-sized={contentSized}
    aria-labelledby={`${id}-title`} aria-describedby={description ? `${id}-description` : undefined}
    onCancel={event => { event.preventDefault(); setClosing(true); }}
    onPointerDown={event => event.stopPropagation()}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key !== 'Tab') return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]'))
        .filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setClosing(true);
    }}>
    <button className={styles.close} type="button" aria-label="Close dialog" onClick={() => setClosing(true)}>
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" /></svg>
    </button>
    <div className={styles.layout}>
      <section className={styles.content}>
        <h2 ref={heading} tabIndex={-1} id={`${id}-title`}>{title}</h2>
        {description && <p id={`${id}-description`} className={styles.description}>{description}</p>}
        {children}
      </section>
      {artwork && <aside className={styles.artwork}>{artwork}</aside>}
    </div>
  </dialog>;
}
