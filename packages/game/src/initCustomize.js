import kaplay from "kaplay";
import { StrictMode, createElement } from "react";
import { createRoot } from "react-dom/client";
import {
  bindCharacterLook,
  CHARACTER_ANIMS,
  hasLookParams,
  lookFromSearchParams,
} from "./character-look";
import CustomizeStudio from "./ReactComponents/CustomizeStudio.jsx";

/**
 * Character studio (?mode=customize&gender=&hair=&...).
 * Certa iframes this and casts the current look as query props.
 */

const WIDTH = 480;
const HEIGHT = 720;

export default function initCustomize() {
  const query = new URLSearchParams(window.location.search);
  const initialLook = lookFromSearchParams(query);
  const earned = (query.get("earned") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const k = kaplay({
    width: WIDTH,
    height: HEIGHT,
    stretch: true,
    letterbox: false,
    background: [12, 20, 18],
    global: false,
    canvas: document.getElementById("game"),
    pixelDensity: 1,
    maxFPS: 30,
    crisp: true,
    focus: false,
    debug: false,
  });

  k.loadSprite("characters", "./characters-black-hair.png", {
    sliceY: 2,
    sliceX: 8,
    anims: CHARACTER_ANIMS,
  });

  k.add([
    k.rect(220, 18),
    k.pos(WIDTH / 2, 268),
    k.anchor("center"),
    k.color(46, 78, 62),
    k.outline(3, k.rgb(22, 36, 30)),
    k.z(5),
  ]);
  k.add([
    k.rect(160, 8),
    k.pos(WIDTH / 2, 278),
    k.anchor("center"),
    k.color(28, 48, 40),
    k.z(4),
  ]);

  const player = k.add([
    k.sprite("characters", { anim: "down-idle" }),
    k.anchor("center"),
    k.pos(WIDTH / 2, 210),
    k.scale(8),
    k.color(255, 255, 255),
    k.z(20),
  ]);
  try {
    player.play("down-idle");
  } catch {
    // static fallback
  }

  const binder = bindCharacterLook(k, () => [player]);
  if (hasLookParams(query)) void binder.apply(initialLook);

  const ui = document.getElementById("ui");
  if (ui) {
    createRoot(ui).render(
      createElement(
        StrictMode,
        null,
        createElement(CustomizeStudio, {
          initialLook,
          earned,
          onLookChange: (look) => {
            void binder.apply(look);
          },
        }),
      ),
    );
  }

  window.parent?.postMessage({ type: "certa:embed-ready" }, window.location.origin);
}
