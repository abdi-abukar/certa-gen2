import { useCallback } from "react";
import { useAtomValue } from "jotai";
import {
  claimAlreadyDoneAtom,
  medalStoredAtom,
  winningDayCurrentAtom,
  winningDayJourneyAtom,
  winningDayPlayerPositionAtom,
} from "../store";
import "./trader-head-actions.css";

const SUMMIT_DAY = 5;

export default function TraderHeadActions() {
  const position = useAtomValue(winningDayPlayerPositionAtom);
  const journey = useAtomValue(winningDayJourneyAtom);
  const currentDay = useAtomValue(winningDayCurrentAtom);
  const claimAlreadyDone = useAtomValue(claimAlreadyDoneAtom);
  const medalStored = useAtomValue(medalStoredAtom);

  const atSummit = currentDay === SUMMIT_DAY && !journey.isMoving;
  const showSummitActions = atSummit && medalStored && !claimAlreadyDone;
  const isVisible = showSummitActions && !journey.isMoving;

  const claimPayout = useCallback(() => {
    const message = { type: "payout-dialog-requested" };
    window.dispatchEvent(new CustomEvent("payout-dialog-requested"));
    if (window.parent !== window) window.parent.postMessage(message, window.location.origin);
  }, []);

  if (!isVisible) return null;

  return (
    <div
      className="trader-head-actions is-summit"
      style={{
        "--trader-x": `${position.x}px`,
        "--trader-y": `${position.y - 62}px`,
        "--trader-mobile-x": `${(position.x / 1920) * 100}vw`,
        "--trader-mobile-y": `${((position.y - 62) / 1080) * 56.25}vw`,
        "--trader-portrait-x": `${(position.x / 1000) * 100}vw`,
        "--trader-portrait-y": `${((position.y - 62) / 1000) * 100}vw`,
      }}
    >
      <div className="trader-head-actions__panel">
        <button
          className="trader-head-actions__claim"
          onClick={claimPayout}
          type="button"
        >
          Go to Payouts
        </button>
      </div>
      <span className="trader-head-actions__line" aria-hidden="true" />
    </div>
  );
}
