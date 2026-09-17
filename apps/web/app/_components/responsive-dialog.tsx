'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { canScrollInDirection } from './dialog-scroll';
import styles from './responsive-dialog.module.css';

let locks = 0;
let restoreScroll: (() => void) | undefined;

function lockScroll() {
  if (locks++ === 0) {
    const body = document.body;
    const root = document.documentElement;
    const { position, top, left, width, overflow, overscrollBehavior, backgroundColor } = body.style;
    const rootStyle = { overflow: root.style.overflow, overscrollBehavior: root.style.overscrollBehavior, backgroundColor: root.style.backgroundColor };
    const x = window.scrollX;
    const y = window.scrollY;
    Object.assign(root.style, { overflow: 'hidden', overscrollBehavior: 'none', backgroundColor: '#f6f3e9' });
    Object.assign(body.style, { position: 'fixed', top: `${-y}px`, left: `${-x}px`, width: '100%', overflow: 'hidden', overscrollBehavior: 'none', backgroundColor: '#f6f3e9' });
    restoreScroll = () => {
      Object.assign(root.style, rootStyle);
      Object.assign(body.style, { position, top, left, width, overflow, overscrollBehavior, backgroundColor });
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
  const scrollArea = useRef<HTMLDivElement>(null);
  const backdropPress = useRef(false);
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
    const measure = () => {
      frame = 0;
      element.style.setProperty('--dialog-viewport-height', `${viewport?.height ?? window.innerHeight}px`);
      element.style.setProperty('--dialog-viewport-top', `${viewport?.offsetTop ?? 0}px`);
      element.style.setProperty('--dialog-viewport-width', `${viewport?.width ?? window.innerWidth}px`);
      element.style.setProperty('--dialog-viewport-left', `${viewport?.offsetLeft ?? 0}px`);
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && focused.matches('input, textarea, select, [contenteditable="true"]') && scrollArea.current?.contains(focused)) {
        const bounds = focused.getBoundingClientRect();
        const area = scrollArea.current.getBoundingClientRect();
        // Scroll only the sheet; scrollIntoView can pan the entire iOS viewport.
        if (bounds.bottom > area.bottom - 20) scrollArea.current.scrollTop += bounds.bottom - area.bottom + 20;
        else if (bounds.top < area.top + 56) scrollArea.current.scrollTop -= area.top + 56 - bounds.top;
      }
    };
    const update = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure();
    let touchX = 0;
    let touchY = 0;
    const touchStart = (event: TouchEvent) => {
      touchX = event.touches[0]?.clientX ?? 0;
      touchY = event.touches[0]?.clientY ?? 0;
    };
    const touchMove = (event: TouchEvent) => {
      if (event.touches.length !== 1) return; // Preserve pinch zoom.
      const touch = event.touches[0]!;
      const dx = touchX - touch.clientX;
      const dy = touchY - touch.clientY;
      touchX = touch.clientX;
      touchY = touch.clientY;
      const vertical = Math.abs(dy) >= Math.abs(dx);
      let target = event.target instanceof HTMLElement ? event.target : null;
      if (target && scrollArea.current?.contains(target)) {
        while (target && element.contains(target)) {
          const style = getComputedStyle(target);
          const overflow = vertical ? style.overflowY : style.overflowX;
          if (/auto|scroll/.test(overflow) && canScrollInDirection(
            vertical ? target.scrollTop : target.scrollLeft,
            vertical ? target.scrollHeight : target.scrollWidth,
            vertical ? target.clientHeight : target.clientWidth,
            vertical ? dy : dx,
          )) return;
          target = target.parentElement;
        }
      }
      if (event.cancelable) event.preventDefault();
    };
    element.addEventListener('touchstart', touchStart, { passive: true });
    element.addEventListener('touchmove', touchMove, { passive: false });
    element.addEventListener('focusin', update);
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      element.removeEventListener('touchstart', touchStart);
      element.removeEventListener('touchmove', touchMove);
      element.removeEventListener('focusin', update);
      if (document.activeElement instanceof HTMLElement && element.contains(document.activeElement)) document.activeElement.blur();
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
    onPointerDown={event => { event.stopPropagation(); backdropPress.current = event.target === event.currentTarget; }}
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
      if (event.target === event.currentTarget && backdropPress.current) setClosing(true);
    }}>
    <div className={styles.viewport}>
      <div className={styles.surface}>
        <button className={styles.close} type="button" aria-label="Close dialog" onClick={() => setClosing(true)}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" /></svg>
        </button>
        <div ref={scrollArea} className={styles.scrollArea}>
          <div className={styles.layout}>
            <section className={styles.content}>
              <h2 ref={heading} tabIndex={-1} id={`${id}-title`}>{title}</h2>
              {description && <p id={`${id}-description`} className={styles.description}>{description}</p>}
              {children}
            </section>
            {artwork && <aside className={styles.artwork}>{artwork}</aside>}
          </div>
        </div>
      </div>
    </div>
  </dialog>;
}
