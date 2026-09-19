'use client';

import { Children, isValidElement, useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import styles from './account-slot-stack.module.css';

// Rank-based springs adapted from https://godui.design/r/card-swap.json.
// Account actions stay still until an intentional swipe; there is no autoplay.
export function AccountSlotStack({ children }: { children: ReactNode }) {
  const items = Children.toArray(children);
  const keys = items.map((item, index) => isValidElement(item) ? String(item.key ?? index) : String(index));
  const [selected, setSelected] = useState<string | null>(null);
  const active = Math.max(0, keys.indexOf(selected ?? ''));
  const [mobile, setMobile] = useState(false);
  const [drag, setDrag] = useState(0);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const reduce = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; x: number; y: number; horizontal: boolean } | null>(null);
  const suppressClick = useRef(false);
  const hintId = useId();
  const count = items.length;

  useEffect(() => {
    const query = window.matchMedia('(max-width: 760px)');
    const update = () => { setMobile(query.matches); setDrag(0); setTilt({ x: 0, y: 0 }); gesture.current = null; };
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  function select(index: number) {
    if (!count) return;
    // Keep keyboard focus out of a card that is about to become inert.
    if (document.activeElement?.closest('[data-slot-frame]') && root.current?.contains(document.activeElement)) {
      root.current.focus({ preventScroll: true });
    }
    setSelected(keys[(index + count) % count]!);
    setDrag(0);
    setTilt({ x: 0, y: 0 });
  }

  function start(event: PointerEvent<HTMLDivElement>) {
    if (!mobile || count < 2 || !event.isPrimary || event.button !== 0) return;
    suppressClick.current = false;
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, horizontal: false };
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const start = gesture.current;
    if (start && start.id === event.pointerId) {
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (!start.horizontal) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return;
        if (Math.abs(dx) < Math.abs(dy) * 1.2) { gesture.current = null; return; }
        start.horizontal = true;
        suppressClick.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      if (!reduce) setDrag(Math.max(-44, Math.min(44, dx * 0.35)));
    } else if (mobile && event.pointerType === 'mouse' && event.buttons === 0 && !reduce) {
      const rect = event.currentTarget.getBoundingClientRect();
      setTilt({ x: -(event.clientY - rect.top - rect.height / 2) / rect.height * 5, y: (event.clientX - rect.left - rect.width / 2) / rect.width * 6 });
    }
  }

  function finish(event: PointerEvent<HTMLDivElement>, cancelled = false) {
    const start = gesture.current;
    if (!start || start.id !== event.pointerId) return;
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const dx = event.clientX - start.x;
    if (!cancelled && start.horizontal && Math.abs(dx) >= 48) select(active + (dx < 0 ? 1 : -1));
    setDrag(0);
  }

  return <div className={styles.root}>
    <div ref={root} className={styles.viewport} role="group" aria-label="Account slots" aria-roledescription={mobile ? 'carousel' : undefined} aria-describedby={mobile && count > 1 ? hintId : undefined} tabIndex={mobile && count > 1 ? 0 : undefined}
      onKeyDown={event => {
        if (!mobile || event.target !== event.currentTarget) return;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); select(active + (event.key === 'ArrowRight' ? 1 : -1)); }
      }}>
      <motion.div className={styles.grid} data-mobile={mobile || undefined}
        animate={{ rotateX: mobile && !reduce ? tilt.x : 0, rotateY: mobile && !reduce ? tilt.y : 0 }}
        transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 170, damping: 20 }}
        onPointerDown={start} onPointerMove={move} onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)}
        onLostPointerCapture={event => { if (event.target === event.currentTarget) { gesture.current = null; setDrag(0); } }}
        onPointerLeave={() => { setTilt({ x: 0, y: 0 }); if (!gesture.current?.horizontal) gesture.current = null; }}
        onDragStart={event => { if (mobile) event.preventDefault(); }}
        onClickCapture={event => { if (suppressClick.current && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}>
        {items.map((child, index) => {
          const rank = (index - active + count) % count;
          const depth = Math.min(rank, 2);
          return <motion.div key={keys[index]} className={styles.card} data-slot-frame data-front={rank === 0 || undefined}
            inert={mobile && rank !== 0} aria-hidden={mobile && rank !== 0 ? true : undefined}
            style={{ zIndex: mobile ? count - rank : undefined }} initial={false}
            animate={{ x: mobile ? rank === 0 ? drag : depth * 8 : 0, y: mobile ? -depth * 17 : 0, scale: mobile ? 1 - depth * 0.045 : 1, rotateZ: mobile ? rank === 0 ? drag * 0.045 : depth * -1 : 0, opacity: mobile && rank > 2 ? 0 : 1 }}
            transition={reduce || !mobile ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 30, mass: 0.9 }}>
            {child}
          </motion.div>;
        })}
      </motion.div>
    </div>
    {count > 1 && <div className={styles.navigation}>
      <div className={styles.dots} aria-hidden="true">{items.map((_, index) => <span key={keys[index]} data-active={index === active || undefined} />)}</div>
      <p id={hintId}>Swipe to switch<span className={styles.srOnly}> accounts, or focus the stack and use the left and right arrow keys.</span></p>
      <span className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true">Account slot {active + 1} of {count}</span>
      {/* A native picker also exposes every slot to touch screen readers. It is visible on keyboard focus. */}
      <select className={styles.accessiblePicker} aria-label="Choose account slot" value={active} onChange={event => select(Number(event.target.value))}>
        {items.map((_, index) => <option key={keys[index]} value={index}>Account slot {index + 1} of {count}</option>)}
      </select>
    </div>}
  </div>;
}
