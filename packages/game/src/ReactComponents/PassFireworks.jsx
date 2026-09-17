import { useAtomValue } from "jotai";
import {
  evalPassCelebratingAtom,
  summitFireworksActiveAtom,
} from "../store";
import "./pass-fireworks.css";

const COLORS = ["#e7b852", "#fff1bd", "#5fc47c", "#ff7a5c", "#7ec8ff"];

// A few large blooms read as fireworks at a glance; the individual rays keep
// the effect crisp over the pixel-art board without needing a canvas layer.
// Every burst lives in the top band of the embed so the show reads as
// fireworks over the summit rather than a screen-wide flash.
const BURSTS = Array.from({ length: 18 }, (_, index) => ({
  delay: `${index * 0.14}s`,
  duration: `${2.4 + (index % 5) * 0.18}s`,
  left: `${5 + ((index * 31) % 90)}%`,
  top: `${3 + ((index * 17) % 19)}%`,
  color: COLORS[index % COLORS.length],
}));

const RAYS = Array.from({ length: 20 }, (_, index) => ({
  angle: `${(360 / 20) * index}deg`,
  distance: `${58 + ((index * 19) % 58)}px`,
  size: `${3 + (index % 4)}px`,
}));

export default function PassFireworks() {
  const celebrating = useAtomValue(evalPassCelebratingAtom);
  const summitFireworksActive = useAtomValue(summitFireworksActiveAtom);

  if (!celebrating && !summitFireworksActive) return null;

  return (
    <div className="pass-fireworks" aria-hidden="true">
      <div className="pass-fireworks__dim" />
      {BURSTS.map((burst, burstIndex) => (
        <div
          className="pass-fireworks__burst"
          key={burstIndex}
          style={{
            "--fw-color": burst.color,
            "--fw-delay": burst.delay,
            "--fw-duration": burst.duration,
            "--fw-left": burst.left,
            "--fw-top": burst.top,
          }}
        >
          {RAYS.map((ray, rayIndex) => (
            <i
              key={rayIndex}
              style={{
                "--fw-angle": ray.angle,
                "--fw-distance": ray.distance,
                "--fw-size": ray.size,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
