import { useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import SummitAward from "./SummitAward";
import {
  evalPassCelebratingAtom,
  medalCollectingAtom,
  rewardDropNonceAtom,
  summitGlowAtom,
} from "../store";
import "./summit-payout.css";

// Summit objective — on the peak floor, just right of the day-5 stand point.
export const SUMMIT_MEDAL_POSITION = { x: 668, y: 248 };
export const SUMMIT_DAY = 5;

export default function SummitObjectiveMedal() {
  const medalCollecting = useAtomValue(medalCollectingAtom);
  const celebrating = useAtomValue(evalPassCelebratingAtom);
  const summitGlow = useAtomValue(summitGlowAtom);
  const rewardDropNonce = useAtomValue(rewardDropNonceAtom);
  const [dropping, setDropping] = useState(false);

  useEffect(() => {
    if (!rewardDropNonce) return;
    setDropping(true);
    const timer = window.setTimeout(() => setDropping(false), 900);
    return () => window.clearTimeout(timer);
  }, [rewardDropNonce]);

  // During pass claim, SummitPayout owns the flying copy — hide this one so
  // two trophies don't stack. Otherwise a prize always sits at the summit.
  if (celebrating || medalCollecting) {
    return null;
  }

  return (
    <div
      className={[
        "summit-medal summit-medal--objective",
        summitGlow ? "is-glowing" : "",
        dropping ? "is-reward-drop" : "",
      ].join(" ")}
      style={{
        "--medal-x": `${SUMMIT_MEDAL_POSITION.x}px`,
        "--medal-y": `${SUMMIT_MEDAL_POSITION.y}px`,
        "--medal-mobile-x": `${(SUMMIT_MEDAL_POSITION.x / 1920) * 100}vw`,
        "--medal-mobile-y": `${(SUMMIT_MEDAL_POSITION.y / 1080) * 56.25}vw`,
        "--medal-portrait-x": `${(SUMMIT_MEDAL_POSITION.x / 1000) * 100}vw`,
        "--medal-portrait-y": `${(SUMMIT_MEDAL_POSITION.y / 1000) * 100}vw`,
      }}
      aria-hidden="true"
    >
      <div className="summit-medal__float summit-medal__float--objective">
        <SummitAward />
      </div>
    </div>
  );
}
