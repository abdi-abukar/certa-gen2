/* eslint-disable react/prop-types */
import { useCallback, useEffect, useRef } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  accountFailedAtom,
  boardModeAtom,
  characterLookAtom,
  claimAlreadyDoneAtom,
  evalBalanceAtom,
  failedTrailRestoredAtom,
  greenDayCountAtom,
  greenDaysCompleteAtom,
  medalIntroPlayedAtom,
  medalCollectingAtom,
  medalStoredAtom,
  needsEvalAtom,
  paidPayoutsAtom,
  payoutAvailableAmountAtom,
  payoutMinimumAmountAtom,
  payoutMinimumMetAtom,
  pnlDatesAtom,
  pnlValuesAtom,
  summitAwardAtom,
  summitFireworksActiveAtom,
  tierProfitRequiredAtom,
  traderNameAtom,
  traderTransitionRequestAtom,
  winningDayCurrentAtom,
  winningDayJourneyAtom,
  winningDayRequestAtom,
  winningDayStatusAtom,
} from "../store";
import "./stage-controls.css";

const DAYS = [1, 2, 3, 4, 5];
const EVAL_DOCK_LABELS = ["$1K", "$1.5K", "$2K", "$2.5K", "$3K"];

export default function StageControls({
  fromDay = 0,
  toDay = 0,
  claimAlreadyDone: initialClaimAlreadyDone = false,
}) {
  const [request, setRequest] = useAtom(winningDayRequestAtom);
  const [pnlValues, setPnlValues] = useAtom(pnlValuesAtom);
  const setPnlDates = useSetAtom(pnlDatesAtom);
  const currentDay = useAtomValue(winningDayCurrentAtom);
  const journey = useAtomValue(winningDayJourneyAtom);
  const status = useAtomValue(winningDayStatusAtom);
  const claimAlreadyDone = useAtomValue(claimAlreadyDoneAtom);
  const medalStored = useAtomValue(medalStoredAtom);
  const payoutMinimumMet = useAtomValue(payoutMinimumMetAtom);
  const payoutMinimumAmount = useAtomValue(payoutMinimumAmountAtom);
  const payoutAvailableAmount = useAtomValue(payoutAvailableAmountAtom);
  const greenDaysComplete = useAtomValue(greenDaysCompleteAtom);
  const boardMode = useAtomValue(boardModeAtom);
  const paidPayouts = useAtomValue(paidPayoutsAtom);
  const tierProfitRequired = useAtomValue(tierProfitRequiredAtom);
  const setClaimAlreadyDone = useSetAtom(claimAlreadyDoneAtom);
  const setMedalStored = useSetAtom(medalStoredAtom);
  const setIntroPlayed = useSetAtom(medalIntroPlayedAtom);
  const setMedalCollecting = useSetAtom(medalCollectingAtom);
  const setPayoutMinimumMet = useSetAtom(payoutMinimumMetAtom);
  const setPayoutMinimumAmount = useSetAtom(payoutMinimumAmountAtom);
  const setPayoutAvailableAmount = useSetAtom(payoutAvailableAmountAtom);
  const setGreenDaysComplete = useSetAtom(greenDaysCompleteAtom);
  const setBoardMode = useSetAtom(boardModeAtom);
  const setEvalBalance = useSetAtom(evalBalanceAtom);
  const setSummitAward = useSetAtom(summitAwardAtom);
  const setPaidPayouts = useSetAtom(paidPayoutsAtom);
  const setTierProfitRequired = useSetAtom(tierProfitRequiredAtom);
  const setTraderName = useSetAtom(traderNameAtom);
  const setCharacterLook = useSetAtom(characterLookAtom);
  const setAccountFailed = useSetAtom(accountFailedAtom);
  const setNeedsEval = useSetAtom(needsEvalAtom);
  const setFailedTrailRestored = useSetAtom(failedTrailRestoredAtom);
  const setGreenDayCount = useSetAtom(greenDayCountAtom);
  const setTraderTransition = useSetAtom(traderTransitionRequestAtom);
  const setSummitFireworksActive = useSetAtom(summitFireworksActiveAtom);
  const initialJourneyStartedRef = useRef(false);
  /** Funded summit fireworks fire once per account payout cycle. */
  const summitFireworksPlayedRef = useRef(new Set());
  const summitFireworksTimerRef = useRef(null);
  const embedReadyPostedRef = useRef(false);
  const tierSnapshotRef = useRef({
    mode: "eval",
    paidPayouts: 0,
    award: "silver",
    accountId: null,
  });

  const startJourney = useCallback(
    (
      requestedFrom,
      requestedTo,
      { replay = false, claimed = false, snap = false } = {},
    ) => {
      const normalizedFrom = clampBoardDay(requestedFrom);
      const normalizedTo = clampBoardDay(requestedTo);
      if (replay) {
        setMedalStored(false);
        setIntroPlayed(false);
        setMedalCollecting(false);
      }
      setClaimAlreadyDone(claimed);
      setRequest((current) => ({
        fromDay: normalizedFrom,
        toDay: normalizedTo,
        nonce: current.nonce + 1,
        replay,
        // Place the sprite directly (swap / replay / settle). Everything else
        // retargets a moving trader instead of interrupting the animation.
        snap: snap || replay,
        claimAlreadyDone: claimed,
      }));
    },
    [setClaimAlreadyDone, setIntroPlayed, setMedalCollecting, setMedalStored, setRequest],
  );

  useEffect(() => {
    if (initialJourneyStartedRef.current) return;
    initialJourneyStartedRef.current = true;
    setClaimAlreadyDone(initialClaimAlreadyDone);

    const normalizedFrom = clampBoardDay(fromDay);
    const normalizedTo = clampBoardDay(toDay);
    startJourney(normalizedFrom, normalizedTo, {
      claimed: initialClaimAlreadyDone,
      snap: true,
    });
  }, [
    fromDay,
    initialClaimAlreadyDone,
    setClaimAlreadyDone,
    startJourney,
    toDay,
  ]);

  useEffect(() => {
    const handleMessage = (event) => {
      const payload = event.data;

      if (
        payload?.type === "set-progress" ||
        payload?.type === "set-winning-journey"
      ) {
        const requestedTo = clampBoardDay(
          payload.toDay ?? payload.to ?? payload.day,
        );
        const requestedFrom = clampBoardDay(
          payload.fromDay ?? payload.from ?? currentDay,
        );
        const numericPnl = parsePnl(payload.pnl);
        const claimed =
          payload.claimAlreadyDone === true ||
          payload.claimed === true ||
          claimAlreadyDone;

        // Only a request that carries a P&L may touch the sign; the parent's
        // journey publishes never do, and zeroing the sign made it flicker.
        if (requestedTo >= 1 && requestedTo <= 4 && payload.pnl !== undefined) {
          setPnlValues((current) =>
            current.map((value, index) =>
              index === requestedTo - 1 ? payload.pnl : value,
            ),
          );
          if (typeof payload.date === "string") {
            setPnlDates((current) =>
              current.map((date, index) =>
                index === requestedTo - 1 ? payload.date : date,
              ),
            );
          }
        }

        const qualifiedTo =
          payload.type === "set-progress" && numericPnl < 200
            ? Math.min(requestedTo, 1)
            : requestedTo;

        if (
          payload.type === "set-winning-journey" &&
          payload.replay !== true &&
          payload.snap !== true
        ) {
          // Already there, or already walking there: nothing to restart.
          if (!journey.isMoving && currentDay === qualifiedTo) return;
          if (journey.isMoving && journey.toDay === qualifiedTo) return;
        }

        startJourney(requestedFrom, qualifiedTo, {
          replay: payload.replay === true,
          snap: payload.snap === true,
          claimed,
        });
        return;
      }

      if (payload?.type === "replay-winning-day") {
        const replayFrom = clampBoardDay(
          payload.fromDay ?? payload.from ?? journey.fromDay,
        );
        const replayTo = clampBoardDay(
          payload.toDay ?? payload.to ?? payload.day ?? journey.toDay,
        );
        startJourney(replayFrom, replayTo, {
          replay: true,
          claimed:
            payload.claimAlreadyDone === true ||
            payload.claimed === true ||
            claimAlreadyDone,
        });
        return;
      }

      if (payload?.type === "set-character") {
        setCharacterLook(payload.look ?? null);
        return;
      }

      if (payload?.type === "celebrate-summit") {
        // Same claim path as a verified pass handoff — trophy collection runs
        // immediately when the board reaches a completed evaluation summit.
        setTraderTransition((current) => ({
          nonce: current.nonce + 1,
          reason: "pass",
          toDay: 5,
          force: false,
        }));
        return;
      }

      if (payload?.type === "trader-transition") {
        const reason =
          payload.reason === "fail"
            ? "fail"
            : payload.reason === "pass"
              ? "pass"
              : "swap";
        setTraderTransition((current) => ({
          nonce: current.nonce + 1,
          reason,
          toDay: clampBoardDay(payload.toDay ?? payload.day ?? 0),
          force: payload.force === true,
        }));
        return;
      }

      if (payload?.type === "set-pnl-values" && Array.isArray(payload.values)) {
        setPnlValues(normalizePnlValues(payload.values));
        if (Array.isArray(payload.dates)) {
          setPnlDates(normalizePnlDates(payload.dates));
        }
        return;
      }

      if (payload?.type === "set-board-config") {
        const nextMode = payload.mode === "eval" ? "eval" : "funded";
        const nextAward =
          nextMode === "eval"
            ? "silver"
            : payload.summitAward === "bronze" ||
                payload.summitAward === "silver" ||
                payload.summitAward === "crown"
              ? payload.summitAward
              : "bronze";
        const nextPaidPayouts =
          typeof payload.paidPayouts === "number"
            ? Math.max(0, payload.paidPayouts)
            : 0;
        const nextAccountId =
          typeof payload.accountId === "string" && payload.accountId.trim()
            ? payload.accountId.trim()
            : null;
        const accountChanged =
          nextAccountId != null &&
          tierSnapshotRef.current.accountId != null &&
          tierSnapshotRef.current.accountId !== nextAccountId;
        const tierChanged =
          accountChanged ||
          tierSnapshotRef.current.mode !== nextMode ||
          tierSnapshotRef.current.paidPayouts !== nextPaidPayouts ||
          tierSnapshotRef.current.award !== nextAward;

        setBoardMode(nextMode);
        if (typeof payload.balance === "number") {
          setEvalBalance(payload.balance);
        }
        if (typeof payload.traderName === "string") {
          setTraderName(payload.traderName.trim().slice(0, 16));
        }
        if (payload.look) {
          setCharacterLook(payload.look);
        }
        if (typeof payload.failed === "boolean") {
          setAccountFailed(payload.failed);
        }
        if (typeof payload.needsEval === "boolean") {
          setNeedsEval(payload.needsEval);
        }
        if (payload.failedRestored === true) {
          setFailedTrailRestored((nonce) => nonce + 1);
        }
        if (typeof payload.greenDays === "number") {
          setGreenDayCount(Math.max(0, Math.min(5, payload.greenDays)));
        }
        setSummitAward(nextAward);
        setPaidPayouts(nextPaidPayouts);
        if (typeof payload.tierProfitRequired === "number") {
          setTierProfitRequired(payload.tierProfitRequired);
        }
        if (typeof payload.claimAlreadyDone === "boolean") {
          // Parent knows whether this cycle's payout is already requested.
          setClaimAlreadyDone(payload.claimAlreadyDone);
        }
        if (tierChanged) {
          const passHandoff =
            !accountChanged &&
            tierSnapshotRef.current.mode === "eval" &&
            nextMode === "funded";
          if (passHandoff) {
            // Silver trophy was already claimed during pass extract — keep it
            // stored so SummitPayout does not replay over the funded trader.
            setMedalStored(true);
            setIntroPlayed(true);
            setMedalCollecting(false);
          } else {
            setMedalStored(false);
            setIntroPlayed(false);
            setMedalCollecting(false);
          }
          tierSnapshotRef.current = {
            mode: nextMode,
            paidPayouts: nextPaidPayouts,
            award: nextAward,
            accountId: nextAccountId ?? tierSnapshotRef.current.accountId,
          };
        } else if (
          nextAccountId &&
          tierSnapshotRef.current.accountId !== nextAccountId
        ) {
          tierSnapshotRef.current = {
            ...tierSnapshotRef.current,
            accountId: nextAccountId,
          };
        }
        return;
      }

      if (payload?.type === "set-payout-eligibility") {
        setPayoutMinimumMet(payload.minimumMet === true);
        setGreenDaysComplete(payload.greenDaysComplete === true);
        if (typeof payload.minimumAmount === "number") {
          setPayoutMinimumAmount(payload.minimumAmount);
        }
        if (typeof payload.availableAmount === "number") {
          setPayoutAvailableAmount(payload.availableAmount);
        }
        if (typeof payload.greenDays === "number") {
          setGreenDayCount(Math.max(0, Math.min(5, payload.greenDays)));
        }
        return;
      }

      if (
        payload?.type === "set-pnl" &&
        Number.isInteger(payload.day) &&
        payload.day >= 1 &&
        payload.day <= 4
      ) {
        setPnlValues((current) =>
          current.map((value, index) =>
            index === payload.day - 1 ? payload.value : value,
          ),
        );
        if (typeof payload.date === "string") {
          setPnlDates((current) =>
            current.map((date, index) =>
              index === payload.day - 1 ? payload.date : date,
            ),
          );
        }
        return;
      }

      const incomingDay =
        typeof payload === "number"
          ? payload
          : payload?.type === "set-winning-day"
            ? payload.day
            : null;

      if (!Number.isInteger(incomingDay)) return;
      startJourney(
        payload?.fromDay ?? payload?.from ?? currentDay,
        incomingDay,
        {
          claimed:
            payload?.claimAlreadyDone === true ||
            payload?.claimed === true ||
            claimAlreadyDone,
        },
      );
    };

    window.addEventListener("message", handleMessage);
    if (!embedReadyPostedRef.current) {
      embedReadyPostedRef.current = true;
      window.parent?.postMessage({ type: "certa:embed-ready" }, window.location.origin);
    }
    window.setWinningDay = (day) =>
      startJourney(currentDay, day, { claimed: claimAlreadyDone });
    window.setWinningJourney = (journeyRequest = {}) =>
      startJourney(
        journeyRequest.fromDay ?? journeyRequest.from ?? currentDay,
        journeyRequest.toDay ?? journeyRequest.to ?? journeyRequest.day,
        {
          replay: journeyRequest.replay === true,
          claimed:
            journeyRequest.claimAlreadyDone === true ||
            journeyRequest.claimed === true ||
            claimAlreadyDone,
        },
      );
    window.setPnlValues = (values) =>
      setPnlValues(normalizePnlValues(values));
    window.setPnlDates = (dates) =>
      setPnlDates(normalizePnlDates(dates));
    window.setWinningProgress = (progress) =>
      handleMessage({ data: { type: "set-progress", ...progress } });
    window.replayWinningDay = () =>
      startJourney(journey.fromDay, journey.toDay, {
        replay: true,
        claimed: claimAlreadyDone,
      });
    window.startTraderTransition = (transitionRequest = {}) => {
      const reason =
        transitionRequest.reason === "fail"
          ? "fail"
          : transitionRequest.reason === "pass"
            ? "pass"
            : "swap";
      setTraderTransition((current) => ({
        nonce: current.nonce + 1,
        reason,
        toDay: clampBoardDay(
          transitionRequest.toDay ?? transitionRequest.day ?? 0,
        ),
      }));
    };

    return () => {
      window.removeEventListener("message", handleMessage);
      delete window.setWinningDay;
      delete window.setWinningJourney;
      delete window.setPnlValues;
      delete window.setPnlDates;
      delete window.setWinningProgress;
      delete window.replayWinningDay;
      delete window.startTraderTransition;
    };
  }, [
    claimAlreadyDone,
    currentDay,
    journey.fromDay,
    journey.isMoving,
    journey.toDay,
    setClaimAlreadyDone,
    setPnlDates,
    setPnlValues,
    setGreenDaysComplete,
    setIntroPlayed,
    setMedalCollecting,
    setMedalStored,
    setBoardMode,
    setEvalBalance,
    setSummitAward,
    setPaidPayouts,
    setTierProfitRequired,
    setTraderTransition,
    setPayoutAvailableAmount,
    setPayoutMinimumAmount,
    setPayoutMinimumMet,
    startJourney,
    setCharacterLook,
    setTraderName,
    setAccountFailed,
    setNeedsEval,
    setFailedTrailRestored,
    setGreenDayCount,
  ]);

  const medalEligible =
    payoutMinimumMet && greenDaysComplete && currentDay === 5;

  // Funded payout summit (bronze and crown alike): fireworks over the peak,
  // once per account cycle. The prize itself stays put — it is not claimed
  // here; the trader requests the payout from the dashboard.
  useEffect(() => {
    if (boardMode !== "funded") return;
    if (!medalEligible || claimAlreadyDone || journey.isMoving) return;
    const key = `${tierSnapshotRef.current.accountId ?? "account"}:${paidPayouts}`;
    if (summitFireworksPlayedRef.current.has(key)) return;
    summitFireworksPlayedRef.current.add(key);
    setSummitFireworksActive(true);
    window.clearTimeout(summitFireworksTimerRef.current);
    summitFireworksTimerRef.current = window.setTimeout(
      () => setSummitFireworksActive(false),
      3600,
    );
  }, [
    boardMode,
    claimAlreadyDone,
    journey.isMoving,
    medalEligible,
    paidPayouts,
    setSummitFireworksActive,
  ]);

  useEffect(
    () => () => window.clearTimeout(summitFireworksTimerRef.current),
    [],
  );

  useEffect(() => {
    if (window.parent === window) return;
    window.parent.postMessage(
      {
        type: "winning-day-progress",
        day: currentDay,
        fromDay: journey.fromDay,
        toDay: journey.toDay,
        moving: journey.isMoving,
        payoutEligible: medalEligible || claimAlreadyDone,
        payoutMinimumMet,
        greenDaysComplete,
        waitingForMinimum:
          greenDaysComplete && currentDay === 5 && !payoutMinimumMet,
        minimumAmount: payoutMinimumAmount,
        availableAmount: payoutAvailableAmount,
        claimAlreadyDone,
        canReplay: journey.canReplay,
        medalStored,
        summitAward: boardMode === "eval" ? "silver" : undefined,
        paidPayouts: boardMode === "funded" ? paidPayouts : undefined,
        tierProfitRequired: boardMode === "funded" ? tierProfitRequired : undefined,
      },
      window.location.origin,
    );
  }, [
    claimAlreadyDone,
    currentDay,
    greenDaysComplete,
    journey,
    medalEligible,
    medalStored,
    paidPayouts,
    tierProfitRequired,
    boardMode,
    payoutAvailableAmount,
    payoutMinimumAmount,
    payoutMinimumMet,
  ]);

  useEffect(() => {
    if (window.parent === window) return;
    window.parent.postMessage(
      { type: "pnl-values-change", values: pnlValues },
      window.location.origin,
    );
  }, [pnlValues]);

  // Keep message/journey wiring mounted; hide the old bottom-left dock UI.
  return <span className="sr-only">{status}</span>;
}

function normalizePnlValues(values) {
  if (!Array.isArray(values)) return [0, 0, 0, 0];
  return Array.from({ length: 4 }, (_, index) => {
    const value = values[index];
    return typeof value === "number" || typeof value === "string" ? value : 0;
  });
}

function normalizePnlDates(dates) {
  if (!Array.isArray(dates)) return ["", "", "", ""];
  return Array.from({ length: 4 }, (_, index) =>
    typeof dates[index] === "string" && dates[index].trim()
      ? dates[index].trim()
      : "",
  );
}

function parsePnl(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function clampBoardDay(value) {
  const day = Number.parseInt(value, 10);
  return Number.isFinite(day) ? Math.max(0, Math.min(5, day)) : 0;
}
