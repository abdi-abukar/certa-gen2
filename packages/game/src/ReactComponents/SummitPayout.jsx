import { useEffect, useRef, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import SummitAward from "./SummitAward";
import { SUMMIT_MEDAL_POSITION } from "./SummitObjectiveMedal";
import {
  boardModeAtom,
  evalPassCelebratingAtom,
  medalCollectingAtom,
  medalIntroPlayedAtom,
  medalStoredAtom,
  summitArrivalNonceAtom,
  winningDayPlayerPositionAtom,
} from "../store";
import "./summit-payout.css";

/** Keep in sync with pass-claim duration in initGame.js */
export const CLAIM_MS = 3200;

const CONFETTI = Array.from({ length: 36 }, (_, index) => ({
  delay: `${0.12 + (index % 12) * 0.05}s`,
  duration: `${1.6 + (index % 5) * 0.12}s`,
  left: `${4 + ((index * 37) % 92)}%`,
  color: ["#e7b852", "#fff1bd", "#5fc47c", "#cf7438"][index % 4],
  turn: `${(index % 2 ? 1 : -1) * (60 + index * 11)}deg`,
  drift: `${-70 + ((index * 43) % 140)}px`,
}));

export default function SummitPayout() {
  const position = useAtomValue(winningDayPlayerPositionAtom);
  const arrivalNonce = useAtomValue(summitArrivalNonceAtom);
  const boardMode = useAtomValue(boardModeAtom);
  const celebrating = useAtomValue(evalPassCelebratingAtom);
  const [introPlayed, setIntroPlayed] = useAtom(medalIntroPlayedAtom);
  const [medalStored, setMedalStored] = useAtom(medalStoredAtom);
  const setMedalStoredOnly = useSetAtom(medalStoredAtom);
  const setMedalCollecting = useSetAtom(medalCollectingAtom);
  const [phase, setPhase] = useState("hidden");
  const collectedNonceRef = useRef(0);
  const claimingRef = useRef(false);
  const awardTimerRef = useRef(null);
  /** Owned by the claim, not the effect: a re-run must never restart the 3.2s. */
  const claimTimerRef = useRef(null);

  const summitCollectOffsetY = SUMMIT_MEDAL_POSITION.y - position.y;
  const canClaim = boardMode === "funded" || celebrating;

  useEffect(() => {
    // Account swaps reset the stored/intro flags so the summit prize can be
    // re-dropped, but the claim itself must never replay: keep the collected
    // nonce so only a brand-new pass arrival (new nonce) can start a claim.
    if (!introPlayed && !medalStored && !claimingRef.current) {
      setPhase("hidden");
      setMedalCollecting(false);
    }
  }, [introPlayed, medalStored, setMedalCollecting]);

  useEffect(() => {
    if (!canClaim) {
      if (phase === "awarded") return;
      setPhase("hidden");
      setMedalCollecting(false);
      return;
    }

    if (medalStored && introPlayed && !celebrating) {
      if (phase === "awarded") return;
      setPhase("done");
      return;
    }

    if (arrivalNonce === 0 || arrivalNonce <= collectedNonceRef.current) {
      return;
    }

    if (claimingRef.current) return;
    claimingRef.current = true;

    setPhase("claiming");
    setMedalCollecting(true);
    setMedalStoredOnly(false);

    // The parent republishes board config while the claim plays (balance
    // polls, account refreshes). Those re-run this effect; the claim itself
    // must keep its original timer or the trophy grab restarts from frame 0.
    window.clearTimeout(claimTimerRef.current);
    claimTimerRef.current = window.setTimeout(() => {
      claimTimerRef.current = null;
      collectedNonceRef.current = arrivalNonce;
      claimingRef.current = false;
      setMedalStored(true);
      setIntroPlayed(true);
      setMedalCollecting(false);
      setPhase("awarded");
      window.clearTimeout(awardTimerRef.current);
      awardTimerRef.current = window.setTimeout(() => setPhase("done"), 900);
    }, CLAIM_MS);
  }, [
    arrivalNonce,
    canClaim,
    celebrating,
    introPlayed,
    medalStored,
    phase,
    setIntroPlayed,
    setMedalStored,
    setMedalStoredOnly,
    setMedalCollecting,
  ]);

  useEffect(
    () => () => {
      window.clearTimeout(awardTimerRef.current);
      window.clearTimeout(claimTimerRef.current);
    },
    [],
  );

  const medalStyle = {
    "--medal-x": `${position.x}px`,
    "--medal-y": `${position.y}px`,
    "--medal-mobile-x": `${(position.x / 1920) * 100}vw`,
    "--medal-mobile-y": `${(position.y / 1080) * 56.25}vw`,
    "--medal-portrait-x": `${(position.x / 1000) * 100}vw`,
    "--medal-portrait-y": `${(position.y / 1000) * 100}vw`,
    "--summit-collect-offset": `${summitCollectOffsetY}px`,
    "--summit-collect-offset-mobile": `${(summitCollectOffsetY / 1080) * 56.25}vw`,
    "--summit-collect-offset-portrait": `${(summitCollectOffsetY / 1000) * 100}vw`,
  };

  if (phase !== "claiming" && phase !== "awarded") {
    return null;
  }

  return (
    <>
      {phase === "claiming" ? (
        <>
          <div className="summit-confetti" aria-hidden="true">
            {CONFETTI.map((piece, index) => (
              <i
                key={index}
                style={{
                  "--confetti-color": piece.color,
                  "--confetti-delay": piece.delay,
                  "--confetti-duration": piece.duration,
                  "--confetti-drift": piece.drift,
                  "--confetti-left": piece.left,
                  "--confetti-turn": piece.turn,
                }}
              />
            ))}
          </div>

          <div
            aria-hidden="true"
            className="summit-medal summit-medal--claim is-claiming"
            style={{
              ...medalStyle,
              "--medal-claim-ms": `${CLAIM_MS}ms`,
            }}
          >
            <div className="summit-medal__float">
              <SummitAward />
            </div>
          </div>
        </>
      ) : (
        <div
          aria-hidden="true"
          className="summit-award-impact"
          style={medalStyle}
        >
          <span>✦</span>
          <strong>TROPHY</strong>
          <small>AWARDED</small>
        </div>
      )}
    </>
  );
}
