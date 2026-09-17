'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Coordinates presentation only. No identity, account or vendor reads. */
export function useIntroJourney(paused = false) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const regionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(true);
  const [frameSource, setFrameSource] = useState<string | null>(null);
  const [landmarks, setLandmarks] = useState<{ index: number; x: number; y: number }[]>([]);
  const [callout, setCallout] = useState<{ index: number; x: number; y: number; characterHeight: number; visible: boolean } | null>(null);

  const send = useCallback((type: string, extra: Record<string, unknown> = {}) => {
    frameRef.current?.contentWindow?.postMessage({ type, ...extra }, window.location.origin);
  }, []);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      setReduced(preference.matches);
      setFrameSource(current => current ?? `/game/index.html?mode=firm&reduced=${preference.matches ? '1' : '0'}`);
      send('certa:firm-motion', { reduced: preference.matches });
    };
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, [send]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow) return;
      if (event.data?.type === 'certa:firm-ready' && event.data.count === 5) {
        setReady(true);
        send('certa:firm-motion', { reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches });
      }
      if (event.data?.type === 'certa:firm-landmarks' && Array.isArray(event.data.landmarks)
        && event.data.landmarks.length <= 5 && event.data.landmarks.every((item: { index?: number; x?: number; y?: number } | null) =>
          item && Number.isInteger(item.index) && item.index! >= 0 && item.index! < 5
          && Number.isFinite(item.x) && item.x! >= 0 && item.x! <= 1
          && Number.isFinite(item.y) && item.y! >= 0 && item.y! <= 1)) {
        setLandmarks(event.data.landmarks);
      }
      if (event.data?.type === 'certa:firm-standing' && Number.isInteger(event.data.index)
        && event.data.index >= 0 && event.data.index < 5
        && Number.isFinite(event.data.x) && event.data.x >= 0 && event.data.x <= 1
        && Number.isFinite(event.data.y) && event.data.y >= 0 && event.data.y <= 1
        && Number.isFinite(event.data.characterHeight) && event.data.characterHeight > 0 && event.data.characterHeight < .3) {
        setCallout({ index: event.data.index, x: event.data.x, y: event.data.y, characterHeight: event.data.characterHeight, visible: true });
      }
      if (event.data?.type === 'certa:firm-moving') {
        setCallout(current => current ? { ...current, visible: false } : null);
      }
      if (event.data?.type === 'certa:firm-error') {
        setReady(false);
      }

    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [send]);

  useEffect(() => {
    let intersecting = true;
    const update = () => setVisible(intersecting && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      intersecting = entry.isIntersecting;
      update();
    }, { threshold: 0.12 });
    if (regionRef.current) observer.observe(regionRef.current);
    document.addEventListener('visibilitychange', update);
    update();
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, []);

  useEffect(() => {
    if (ready) send(visible && !hovered && !focused && !paused ? 'certa:resume' : 'certa:pause');
  }, [ready, visible, hovered, focused, paused, send]);

  const selectTopic = useCallback((index: number) => {
    setCallout({ index, x: .5, y: .812, characterHeight: .08, visible: true });
    send('certa:firm-focus', { index });
  }, [send]);

  return { selectTopic, setHovered, setFocused, frameRef, regionRef, trackRef, ready, frameSource, callout, landmarks, reduced };
}
