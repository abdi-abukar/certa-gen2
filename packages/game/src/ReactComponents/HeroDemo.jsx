import { useEffect, useRef } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import {
  boardModeAtom,
  claimAlreadyDoneAtom,
  greenDaysCompleteAtom,
  medalCollectingAtom,
  medalIntroPlayedAtom,
  medalStoredAtom,
  payoutAvailableAmountAtom,
  payoutMinimumAmountAtom,
  payoutMinimumMetAtom,
  pnlDatesAtom,
  pnlValuesAtom,
  summitAwardAtom,
  winningDayCurrentAtom,
  winningDayJourneyAtom,
  winningDayRequestAtom,
} from "../store";
import "./hero-demo.css";

const HOLD_AFTER_CLAIM_MS = 2200;
const DEMO_PNL = [420, 380, 510, 290];
const DEMO_DATES = ["Mon", "Tue", "Wed", "Thu"];

export function isHeroMode() {
  if (typeof window === "undefined") return false;
  const query = new URLSearchParams(window.location.search);
  const mode = (query.get("mode") ?? "").toLowerCase();
  return mode === "hero" || query.get("hero") === "1";
}

/**
 * Marketing loop: climb base → summit, collect an award, hold, reset, repeat.
 * Driven by ?mode=hero (or ?hero=1).
 */
export default function HeroDemo() {
  const enabled = isHeroMode();
  const currentDay = useAtomValue(winningDayCurrentAtom);
  const journey = useAtomValue(winningDayJourneyAtom);
  const medalStored = useAtomValue(medalStoredAtom);
  const medalCollecting = useAtomValue(medalCollectingAtom);

  const setBoardMode = useSetAtom(boardModeAtom);
  const setSummitAward = useSetAtom(summitAwardAtom);
  const setPayoutMinimumMet = useSetAtom(payoutMinimumMetAtom);
  const setGreenDaysComplete = useSetAtom(greenDaysCompleteAtom);
  const setPayoutMinimumAmount = useSetAtom(payoutMinimumAmountAtom);
  const setPayoutAvailableAmount = useSetAtom(payoutAvailableAmountAtom);
  const setPnlValues = useSetAtom(pnlValuesAtom);
  const setPnlDates = useSetAtom(pnlDatesAtom);
  const setClaimAlreadyDone = useSetAtom(claimAlreadyDoneAtom);
  const setMedalStored = useSetAtom(medalStoredAtom);
  const setIntroPlayed = useSetAtom(medalIntroPlayedAtom);
  const setMedalCollecting = useSetAtom(medalCollectingAtom);
  const setRequest = useSetAtom(winningDayRequestAtom);

  const configuredRef = useRef(false);
  const loopTimerRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;
    document.documentElement.classList.add("hero-mode");
    document.body.classList.add("hero-mode");
    return () => {
      document.documentElement.classList.remove("hero-mode");
      document.body.classList.remove("hero-mode");
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || configuredRef.current) return;
    configuredRef.current = true;

    setBoardMode("eval");
    setSummitAward("silver");
    setPayoutMinimumMet(true);
    setGreenDaysComplete(true);
    setPayoutMinimumAmount(3000);
    setPayoutAvailableAmount(3000);
    setPnlValues(DEMO_PNL);
    setPnlDates(DEMO_DATES);
    setClaimAlreadyDone(false);
  }, [
    enabled,
    setBoardMode,
    setClaimAlreadyDone,
    setGreenDaysComplete,
    setPayoutAvailableAmount,
    setPayoutMinimumAmount,
    setPayoutMinimumMet,
    setPnlDates,
    setPnlValues,
    setSummitAward,
  ]);

  useEffect(() => {
    if (!enabled) return;
    if (journey.isMoving || medalCollecting) return;
    if (currentDay !== 5 || !medalStored) return;

    if (loopTimerRef.current) window.clearTimeout(loopTimerRef.current);

    loopTimerRef.current = window.setTimeout(() => {
      setMedalStored(false);
      setIntroPlayed(false);
      setMedalCollecting(false);
      setClaimAlreadyDone(false);
      setRequest((current) => ({
        fromDay: 0,
        toDay: 5,
        nonce: current.nonce + 1,
        replay: true,
        claimAlreadyDone: false,
      }));
    }, HOLD_AFTER_CLAIM_MS);

    return () => {
      if (loopTimerRef.current) window.clearTimeout(loopTimerRef.current);
    };
  }, [
    currentDay,
    enabled,
    journey.isMoving,
    medalCollecting,
    medalStored,
    setClaimAlreadyDone,
    setIntroPlayed,
    setMedalCollecting,
    setMedalStored,
    setRequest,
  ]);

  return null;
}
