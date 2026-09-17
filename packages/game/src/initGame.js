import initKaplay from "./kaplayCtx";
import { createGliderTexture } from "./glider-texture";
import { createHeliTexture } from "./heli-texture";
import { createLadderTexture } from "./ladder-texture";
import { createLetterTexture } from "./letter-texture";
import { createWoodSignTexture } from "./wood-sign-texture";
import {
  accountFailedAtom,
  boardModeAtom,
  characterLookAtom,
  claimAlreadyDoneAtom,
  evalPassCelebratingAtom,
  failedTrailRestoredAtom,
  greenDayCountAtom,
  greenDaysCompleteAtom,
  medalCollectingAtom,
  medalIntroPlayedAtom,
  medalStoredAtom,
  paidPayoutsAtom,
  payoutMinimumMetAtom,
  pnlValuesAtom,
  rewardDropNonceAtom,
  store,
  summitArrivalNonceAtom,
  summitAwardAtom,
  summitGlowAtom,
  traderNameAtom,
  traderTransitionRequestAtom,
  winningDayCurrentAtom,
  winningDayJourneyAtom,
  winningDayPlayerPositionAtom,
  winningDayRequestAtom,
  winningDayStatusAtom,
} from "./store";
import { loadLookSprite, lookKey, retargetSprite } from "./character-look";

const NAME_MAX = 12;
const STAR_MAX = 5;

const CHECKPOINTS = [
  { x: 260, y: 945 },
  { x: 250, y: 828 },
  { x: 330, y: 705 },
  { x: 350, y: 552 },
  { x: 350, y: 414 },
  { x: 513, y: 270 },
];

const MILESTONE_SIGNS = [
  { day: 1, x: 96, surfaceY: 876 },
  { day: 2, x: 120, surfaceY: 753 },
  { day: 3, x: 165, surfaceY: 600 },
  { day: 4, x: 180, surfaceY: 462 },
];

const PLAYER_SCALE = 6;
const LANDING_DURATION = 0.16;
const TAP_ROTATE_DEG = 25;
const TAP_ROTATE_DURATION = 0.28;
const SIGN_FONT = "sign";
const SIGN_SCALE = 3;
const SIGN_HALF_HEIGHT = (48 * SIGN_SCALE) / 2;
const SIGN_TOP_PAD = 42;
const SIGN_LINE_GAP = 36;
const SIGN_TEXT_WIDTH = 220;
const DAY_SIGN_SIZE = 30;
const PNL_SIGN_SIZE = 34;
const PNL_ZERO_COLOR = [255, 248, 220];
const PNL_POSITIVE_COLOR = [117, 211, 145];
const PNL_NEGATIVE_COLOR = [238, 141, 131];
const EVAL_MARK_TOP = ["$1K", "$1.5K", "$2K", "$2.5K"];
const EVAL_MARK_SIZE = 34;
const DAY_SIGN_COLOR = [255, 248, 230];
const SIGN_SHADOW_COLOR = [28, 16, 8];
const EVAL_SIGN_COLOR = [255, 236, 176];
const WORLD_WIDTH = 1920;
const WORLD_HEIGHT = 1080;
/** Framing must keep mountain + summit trophy on-screen (medal x 668). */
const LANDSCAPE_FOCUS_RIGHT = 840;
/** Summit award world Y — keep it below Adventure Mode top chrome. */
const SUMMIT_MEDAL_Y = 140;
/** Screen px reserved under the top bar so the award is never covered. */
const LANDSCAPE_TOP_UI_PAD = 88;
/** Ground-to-summit span the camera frames around. */
const TOWER_HEIGHT = WORLD_HEIGHT - SUMMIT_MEDAL_Y;
/** Sky color sampled from the top edge of world-background.png. */
const SKY_COLOR = [161, 191, 174];

export default function initGame() {
  const k = initKaplay();
  let viewportInsets = { top: LANDSCAPE_TOP_UI_PAD, right: 0, bottom: 0 };

  // Full-bleed sky behind everything, pinned to the screen rather than the
  // world. Framing legitimately shows area above the artwork on tall windows;
  // without this the canvas clear color shows through as a dark band there.
  const skyBackdrop = k.add([
    k.rect(k.width(), k.height()),
    k.pos(0, 0),
    k.fixed(),
    k.color(...SKY_COLOR),
    k.z(-2),
  ]);

  /**
   * One continuous rule for every aspect ratio — no portrait/landscape branch,
   * so dragging a window across square does not snap the zoom. Two hard caps
   * always hold: the mountain and summit award stay fully on-screen, and the
   * award stays clear of the Adventure Mode top bar. Under those caps we zoom
   * in as far as the artwork allows so the scene fills the embed.
   */
  const syncCameraToEmbed = () => {
    const viewportWidth = Math.max(k.width(), 1);
    const viewportHeight = Math.max(k.height(), 1);
    const usableHeight = Math.max(1, viewportHeight - viewportInsets.top - viewportInsets.bottom);
    const usableWidth = Math.max(1, viewportWidth - viewportInsets.right);

    const framingCap = Math.min(
      usableWidth / LANDSCAPE_FOCUS_RIGHT,
      usableHeight / TOWER_HEIGHT,
    );
    // Fill the embed with artwork whenever the caps leave room to.
    const coverScale = Math.max(
      viewportWidth / WORLD_WIDTH,
      viewportHeight / WORLD_HEIGHT,
    );

    const scale = Math.min(framingCap, coverScale);
    k.camScale(scale);
    // Left edge pinned to world x=0, ground pinned to the bottom of the embed.
    k.camPos(
      viewportWidth / (2 * scale),
      WORLD_HEIGHT - (viewportHeight / 2 - viewportInsets.bottom) / scale,
    );

    // DOM awards and canvas terrain must use the identical world transform.
    const ui = document.getElementById("ui");
    if (ui) {
      ui.style.transform = `scale(${scale})`;
      ui.style.bottom = `${viewportInsets.bottom}px`;
    }

    skyBackdrop.width = viewportWidth;
    skyBackdrop.height = viewportHeight;
  };

  syncCameraToEmbed();
  k.onResize(syncCameraToEmbed);
  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || event.data?.type !== "certa:board-viewport") return;
    const { top, right, bottom } = event.data;
    if (![top, right, bottom].every((value) => Number.isFinite(value) && value >= 0)) return;
    viewportInsets = { top, right, bottom };
    syncCameraToEmbed();
  });

  const gameCanvas = document.getElementById("game");
  gameCanvas?.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    window.parent?.postMessage({ type: "certa:engine-lost" }, window.location.origin);
  });

  k.loadSprite("background", "./world-background.png");
  k.loadSprite("characters", "./characters-black-hair.png", {
    sliceY: 2,
    sliceX: 8,
    anims: {
      "down-idle": 0,
      "up-idle": 1,
      "right-idle": 2,
      "left-idle": 3,
      right: { from: 4, to: 5, loop: true },
      left: { from: 6, to: 7, loop: true },
      down: { from: 8, to: 9, loop: true },
      up: { from: 10, to: 11, loop: true },
    },
  });
  k.loadSprite("wood-sign", createWoodSignTexture());
  k.loadSprite("glider", createGliderTexture());
  k.loadSprite("letter", createLetterTexture());
  k.loadSprite("ladder", createLadderTexture());
  k.loadSprite("heli", createHeliTexture());
  k.loadSprite("gold-star", createGoldStarTexture());
  k.loadFont(
    SIGN_FONT,
    "./game-font.ttf",
  );

  k.add([k.sprite("background"), k.pos(0, 0), k.scale(3), k.z(0)]);

  const signLineY = (surfaceY, lineIndex) =>
    surfaceY - SIGN_HALF_HEIGHT * 2 + SIGN_TOP_PAD + lineIndex * SIGN_LINE_GAP;

  const signLabels = MILESTONE_SIGNS.map((sign) => {
    k.add([
      k.sprite("wood-sign"),
      k.pos(sign.x, sign.surfaceY - SIGN_HALF_HEIGHT),
      k.anchor("center"),
      k.scale(SIGN_SCALE),
      k.z(8),
    ]);

    const addLine = (text, y, size, color) => {
      const options = {
        align: "center",
        font: SIGN_FONT,
        size,
        width: SIGN_TEXT_WIDTH,
        lineSpacing: 4,
      };
      const outlineOffsets = [
        [-2, -2],
        [2, -2],
        [-2, 2],
        [2, 2],
        [0, -2],
        [0, 2],
        [-2, 0],
        [2, 0],
      ];
      const outline = outlineOffsets.map(([offsetX, offsetY]) =>
        k.add([
          k.text(text, options),
          k.pos(sign.x + offsetX, y + offsetY),
          k.anchor("center"),
          k.color(...SIGN_SHADOW_COLOR),
          k.z(9),
        ]),
      );
      const shadow = k.add([
        k.text(text, options),
        k.pos(sign.x + 3, y + 3),
        k.anchor("center"),
        k.color(...SIGN_SHADOW_COLOR),
        k.z(9),
      ]);
      const front = k.add([
        k.text(text, options),
        k.pos(sign.x, y),
        k.anchor("center"),
        k.color(...color),
        k.z(10),
      ]);
      return { outline, front, shadow };
    };

    const day = addLine(
      `DAY ${sign.day}`,
      signLineY(sign.surfaceY, 0),
      DAY_SIGN_SIZE,
      DAY_SIGN_COLOR,
    );
    const value = store.get(pnlValuesAtom)[sign.day - 1];
    const pnl = addLine(
      signPnlLabel(value),
      signLineY(sign.surfaceY, 1),
      PNL_SIGN_SIZE,
      signPnlColor(value),
    );

    return { top: day, bottom: pnl };
  });

  const updateSignLabels = () => {
    const boardMode = store.get(boardModeAtom);
    const values = store.get(pnlValuesAtom);

    signLabels.forEach((label, index) => {
      if (boardMode === "eval") {
        setSignLineVisible(label.top, true);
        applySignLine(
          k,
          label.top,
          EVAL_MARK_TOP[index] ?? "",
          EVAL_SIGN_COLOR,
          EVAL_MARK_SIZE,
        );
        setSignLineVisible(label.bottom, false);
        return;
      }

      setSignLineVisible(label.bottom, true);
      const value = values[index];
      applySignLine(
        k,
        label.top,
        `DAY ${index + 1}`,
        DAY_SIGN_COLOR,
        DAY_SIGN_SIZE,
      );
      applySignLine(
        k,
        label.bottom,
        signPnlLabel(value),
        signPnlColor(value),
        PNL_SIGN_SIZE,
      );
    });
  };

  store.sub(pnlValuesAtom, updateSignLabels);
  store.sub(boardModeAtom, updateSignLabels);
  updateSignLabels();

  let characterSpriteName = "characters";
  let lookNonce = 0;
  let lastLookKey = "";

  const player = k.add([
    k.sprite("characters", { anim: "right-idle" }),
    k.anchor("center"),
    k.pos(CHECKPOINTS[0].x, CHECKPOINTS[0].y),
    k.scale(PLAYER_SCALE),
    k.rotate(0),
    k.color(255, 255, 255),
    // Slightly taller hitbox so taps land on the sprite even when scaled.
    k.area({ scale: 1.35 }),
    k.z(20),
    "player",
  ]);

  const nameTagShadow = k.add([
    k.text("", {
      align: "center",
      font: SIGN_FONT,
      size: 18,
      width: 240,
    }),
    k.anchor("center"),
    k.pos(CHECKPOINTS[0].x + 2, CHECKPOINTS[0].y - 56),
    k.color(...SIGN_SHADOW_COLOR),
    k.z(21),
  ]);
  const nameTag = k.add([
    k.text("", {
      align: "center",
      font: SIGN_FONT,
      size: 18,
      width: 240,
    }),
    k.anchor("center"),
    k.pos(CHECKPOINTS[0].x, CHECKPOINTS[0].y - 58),
    k.color(255, 248, 230),
    k.z(22),
  ]);
  const starSprites = Array.from({ length: STAR_MAX }, () =>
    k.add([
      k.sprite("gold-star"),
      k.anchor("center"),
      k.pos(0, 0),
      k.scale(2.2),
      k.opacity(0),
      k.z(23),
      "gold-star",
    ]),
  );

  let targetDay = 0;
  let currentDay = 0;
  let journeyFromDay = 0;
  let journeyToDay = 0;
  let hop = null;
  let nextHopDelay = 0;
  let landing = 0;
  let facing = "right";
  /** Idle tap: twist 25° then ease back — never a full cardinal reface. */
  let tapTwist = null;
  let journeyActive = false;
  let transition = null;
  let glider = null;
  let letter = null;
  let ladder = null;
  let heli = null;
  let secondRunner = null;

  const applyCharacterLook = async (look) => {
    if (!look) return;
    const key = lookKey(look);
    if (key === lastLookKey) return;
    lastLookKey = key;
    lookNonce += 1;
    const name = `characters-look-${lookNonce}`;
    await loadLookSprite(k, name, look);
    characterSpriteName = name;
    retargetSprite(k, player, characterSpriteName);
    if (secondRunner) retargetSprite(k, secondRunner, characterSpriteName, "left");
  };

  store.sub(characterLookAtom, () => {
    void applyCharacterLook(store.get(characterLookAtom));
  });
  void applyCharacterLook(store.get(characterLookAtom));
  let pendingFailExit = null;
  let passCelebrated = false;
  /** Canonical: heli extract plays once per account timeline. */
  let extractPlayed = false;
  /** After fail extract, keep the trail empty until a new account snaps in. */
  let trailCleared = false;

  const playIfNeeded = (animation) => {
    if (player.getCurAnim()?.name !== animation) player.play(animation);
  };

  const cancelTapTwist = () => {
    tapTwist = null;
    player.angle = 0;
  };

  const beginTapTwist = () => {
    // Never interrupt jump / transitions — hop animation stays unchanged.
    if (hop || transition || player.hidden || trailCleared) return;

    // Face the camera, then rotate 25° — avoid staying on the jump "up"/back view.
    facing = "down";
    playIfNeeded("down-idle");
    tapTwist = {
      elapsed: 0,
      duration: TAP_ROTATE_DURATION,
      direction: tapTwist?.direction === 1 ? -1 : 1,
    };
  };

  player.onHover(() => {
    if (!player.hidden && !hop && !transition) k.setCursor("pointer");
  });
  player.onHoverEnd(() => {
    k.setCursor("default");
  });
  player.onClick(() => {
    beginTapTwist();
  });

  const syncNameTag = () => {
    const label = String(store.get(traderNameAtom) ?? "")
      .trim()
      .slice(0, NAME_MAX);
    nameTag.text = label || " ";
    nameTagShadow.text = label || " ";
    const hidden = !label || player.hidden;
    nameTag.hidden = hidden;
    nameTagShadow.hidden = hidden;
    if (!hidden) {
      nameTag.pos.x = player.pos.x;
      nameTag.pos.y = player.pos.y - 58;
      nameTagShadow.pos.x = player.pos.x + 2;
      nameTagShadow.pos.y = player.pos.y - 56;
    }
  };

  const syncGoldStars = () => {
    const mode = store.get(boardModeAtom);
    const count = Math.min(
      STAR_MAX,
      Math.max(0, Number(store.get(greenDayCountAtom)) || 0),
    );
    const show = mode === "funded" && count > 0 && !player.hidden && !trailCleared;
    const spacing = 32;
    const startX = player.pos.x - ((count - 1) * spacing) / 2;
    const y = player.pos.y - 86;
    starSprites.forEach((star, index) => {
      if (!show || index >= count) {
        star.opacity = 0;
        return;
      }
      star.opacity = 1;
      star.pos.x = startX + index * spacing;
      star.pos.y = y + Math.sin(k.time() * 3 + index) * 1.5;
    });
  };

  const publishPlayerPosition = () => {
    store.set(winningDayPlayerPositionAtom, {
      x: player.pos.x,
      y: player.pos.y,
    });
    syncNameTag();
    syncGoldStars();
  };

  const destroyGlider = () => {
    if (glider) {
      k.destroy(glider);
      glider = null;
    }
  };

  const destroyLetter = () => {
    if (letter) {
      k.destroy(letter);
      letter = null;
    }
  };

  const destroyLadderRig = () => {
    if (ladder) {
      k.destroy(ladder);
      ladder = null;
    }
    if (heli) {
      k.destroy(heli);
      heli = null;
    }
  };

  const destroySecondRunner = () => {
    if (secondRunner) {
      k.destroy(secondRunner);
      secondRunner = null;
    }
  };

  const attachGlider = () => {
    destroyGlider();
    glider = k.add([
      k.sprite("glider"),
      k.anchor("center"),
      k.pos(player.pos.x, player.pos.y - 54),
      k.scale(3.2),
      k.rotate(-18),
      k.z(19),
      "glider",
    ]);
  };

  const spawnHeliAt = (x, y) => {
    destroyLadderRig();
    heli = k.add([
      k.sprite("heli"),
      k.anchor("center"),
      k.pos(x, y),
      k.scale(2.6),
      k.z(24),
      "heli",
    ]);
  };

  const syncHeliAt = (x, y, { wobble = false } = {}) => {
    if (!heli) return;
    heli.pos.x = wobble ? x + Math.sin(k.time() * 14) * 1.2 : x;
    heli.pos.y = y;
  };

  const placePlayer = (day) => {
    const checkpoint = CHECKPOINTS[day];
    player.pos.x = checkpoint.x;
    player.pos.y = checkpoint.y;
    player.scale.x = PLAYER_SCALE;
    player.scale.y = PLAYER_SCALE;
    player.angle = 0;
    player.hidden = trailCleared;
    destroyGlider();
    publishPlayerPosition();
  };

  store.sub(traderNameAtom, syncNameTag);
  store.sub(boardModeAtom, syncGoldStars);
  store.sub(greenDayCountAtom, syncGoldStars);
  store.sub(failedTrailRestoredAtom, () => {
    if (!store.get(failedTrailRestoredAtom)) return;
    // Canonical restore: skip heli, leave the trail empty.
    extractPlayed = true;
    trailCleared = true;
    passCelebrated = false;
    transition = null;
    hop = null;
    journeyActive = false;
    player.hidden = true;
    destroyLadderRig();
    destroyGlider();
    store.set(accountFailedAtom, true);
    store.set(winningDayStatusAtom, "Account failed — buy a new evaluation.");
    publishPlayerPosition();
  });
  syncNameTag();
  syncGoldStars();

  const publishJourney = (isMoving, canReplay = false) => {
    store.set(winningDayJourneyAtom, {
      fromDay: journeyFromDay,
      toDay: journeyToDay,
      isMoving,
      canReplay,
    });
  };

  const easeInOut = (t) =>
    t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

  const midScreen = () => ({
    x: WORLD_WIDTH * 0.48,
    y: WORLD_HEIGHT * 0.4,
  });

  const beginRunIn = (enterDay, reason) => {
    const day = clampDay(enterDay);
    const destination = CHECKPOINTS[day];
    destroyGlider();
    destroyLetter();
    destroyLadderRig();

    if (reason === "pass") {
      store.set(boardModeAtom, "funded");
      store.set(evalPassCelebratingAtom, false);
      store.set(summitGlowAtom, false);
      store.set(accountFailedAtom, false);
      store.set(greenDayCountAtom, 0);
      store.set(greenDaysCompleteAtom, false);
      store.set(payoutMinimumMetAtom, false);
      store.set(claimAlreadyDoneAtom, false);
      // Trophy stays at summit; funded cycle starts bronze (then crown).
      const paidPayouts = store.get(paidPayoutsAtom) ?? 0;
      store.set(summitAwardAtom, paidPayouts > 0 ? "crown" : "bronze");
      store.set(medalStoredAtom, true);
      store.set(medalCollectingAtom, false);
      store.set(medalIntroPlayedAtom, true);
      store.set(rewardDropNonceAtom, store.get(rewardDropNonceAtom) + 1);
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "pass-complete" }, window.location.origin);
      }
      // Next funded trader runs in from the right to base camp (day 0).
      const startX = Math.max(destination.x + 280, 720);
      player.hidden = true;
      destroySecondRunner();
      secondRunner = k.add([
        k.sprite(characterSpriteName, { anim: "left" }),
        k.anchor("center"),
        k.pos(startX, destination.y),
        k.scale(PLAYER_SCALE),
        k.color(210, 236, 255),
        k.z(19),
        "second-runner",
      ]);
      transition = {
        phase: "second-run",
        elapsed: 0,
        duration: Math.min(
          2.1,
          Math.max(1.15, (startX - destination.x) / 260),
        ),
        from: { x: startX, y: destination.y },
        to: { x: destination.x, y: destination.y },
        enterDay: day,
        reason,
        facing: "left",
      };
      currentDay = day;
      targetDay = day;
      journeyFromDay = day;
      journeyToDay = day;
      publishJourney(true, false);
      store.set(winningDayCurrentAtom, day);
      store.set(
        winningDayStatusAtom,
        "Certified Funded trader running in…",
      );
      publishPlayerPosition();
      return;
    }

    // Account swap: snap instantly — no run-in timeline.
    destroySecondRunner();
    transition = null;
    hop = null;
    nextHopDelay = 0;
    landing = 0;
    journeyActive = false;
    trailCleared = false;
    player.hidden = false;
    placePlayer(day);
    currentDay = day;
    targetDay = day;
    journeyFromDay = day;
    journeyToDay = day;
    facing = "right";
    playIfNeeded("right-idle");
    publishJourney(false, false);
    store.set(winningDayCurrentAtom, day);
    store.set(
      winningDayStatusAtom,
      day === 0
        ? "Account ready at base camp."
        : `Holding at Day ${day}.`,
    );
    publishPlayerPosition();
  };

  const beginHeliExtract = (enterDay, reason) => {
    // Pass only — fail snaps away without heli.
    if (reason !== "pass") {
      extractPlayed = true;
      finishFailExtract();
      void enterDay;
      return;
    }
    if (extractPlayed) return;
    extractPlayed = true;
    destroyGlider();
    destroyLetter();
    destroyLadderRig();

    const grabX = player.pos.x;
    const grabY = player.pos.y - 72;
    const startX = grabX + 320;
    const startY = grabY - 50;
    spawnHeliAt(startX, startY);
    facing = "right";
    playIfNeeded("right-idle");
    transition = {
      phase: "heli-approach",
      elapsed: 0,
      duration: 0.85,
      from: { x: startX, y: startY },
      to: { x: grabX, y: grabY },
      hangOffset: 36,
      enterDay,
      reason,
    };
    publishJourney(true, false);
    store.set(winningDayStatusAtom, "Helicopter inbound for extract…");
  };

  const startFailExit = (enterDay) => {
    if (extractPlayed || passCelebrated) return;
    void enterDay;
    destroyGlider();
    destroyLadderRig();
    destroySecondRunner();
    store.set(evalPassCelebratingAtom, false);
    store.set(summitGlowAtom, false);
    store.set(accountFailedAtom, true);
    hop = null;
    nextHopDelay = 0;
    landing = 0;
    journeyActive = false;
    pendingFailExit = null;
    transition = null;
    extractPlayed = true;
    finishFailExtract();
  };

  const finishFailExtract = () => {
    trailCleared = true;
    transition = null;
    player.hidden = true;
    destroyLadderRig();
    destroySecondRunner();
    publishJourney(false, false);
    store.set(accountFailedAtom, true);
    store.set(winningDayStatusAtom, "Account failed — buy a new evaluation.");
    publishPlayerPosition();
  };

  const finishPassExtract = () => {
    // Trophy claimed — stay at the summit and settle into funded without heli
    // extract or a full player swap-out.
    destroyLadderRig();
    destroySecondRunner();
    destroyGlider();
    trailCleared = false;
    transition = null;
    extractPlayed = true;
    passCelebrated = true;
    player.hidden = false;

    store.set(boardModeAtom, "funded");
    store.set(evalPassCelebratingAtom, false);
    store.set(summitGlowAtom, false);
    store.set(accountFailedAtom, false);
    store.set(greenDayCountAtom, 0);
    store.set(greenDaysCompleteAtom, false);
    store.set(payoutMinimumMetAtom, false);
    store.set(claimAlreadyDoneAtom, false);
    const paidPayouts = store.get(paidPayoutsAtom) ?? 0;
    store.set(summitAwardAtom, paidPayouts > 0 ? "crown" : "bronze");
    store.set(medalStoredAtom, true);
    store.set(medalCollectingAtom, false);
    store.set(medalIntroPlayedAtom, true);
    store.set(rewardDropNonceAtom, store.get(rewardDropNonceAtom) + 1);

    currentDay = 5;
    targetDay = 5;
    journeyFromDay = 5;
    journeyToDay = 5;
    placePlayer(5);
    facing = "down";
    playIfNeeded("down-idle");
    publishJourney(false, false);
    store.set(winningDayCurrentAtom, 5);
    store.set(
      winningDayStatusAtom,
      "Trophy claimed — Certified Funded unlocked.",
    );
    publishPlayerPosition();

    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "pass-complete" }, window.location.origin);
    }
  };

  const startTraderTransition = (request) => {
    cancelTapTwist();
    const enterDay = clampDay(request?.toDay);
    const reason =
      request?.reason === "fail"
        ? "fail"
        : request?.reason === "pass"
          ? "pass"
          : "swap";
    const force = request?.force === true;

    // Temp test buttons: reset extract gates so force fail/pass can re-fire.
    if (force && (reason === "fail" || reason === "pass")) {
      extractPlayed = false;
      passCelebrated = false;
      trailCleared = false;
      transition = null;
      hop = null;
      journeyActive = false;
      pendingFailExit = null;
      player.hidden = false;
      destroyLadderRig();
      destroyGlider();
      destroySecondRunner();
      store.set(failedTrailRestoredAtom, 0);
      store.set(accountFailedAtom, false);
      store.set(evalPassCelebratingAtom, false);
      store.set(summitGlowAtom, false);
      store.set(boardModeAtom, "eval");
      store.set(summitAwardAtom, "silver");
      store.set(greenDayCountAtom, 0);
      store.set(medalStoredAtom, false);
      store.set(medalIntroPlayedAtom, false);
      store.set(medalCollectingAtom, false);
      placePlayer(reason === "pass" ? 5 : currentDay);
      if (reason === "pass") {
        currentDay = 5;
        targetDay = 5;
        journeyFromDay = 5;
        journeyToDay = 5;
        store.set(winningDayCurrentAtom, 5);
      }
      publishPlayerPosition();
    }

    if (reason === "fail") {
      startFailExit(enterDay);
      return;
    }

    hop = null;
    nextHopDelay = 0;
    landing = 0;
    journeyActive = false;
    pendingFailExit = null;
    destroyLetter();
    destroySecondRunner();
    destroyGlider();
    destroyLadderRig();

    if (reason === "pass") {
      if (!force && (passCelebrated || extractPlayed || transition)) return;
      // Claim trophy, then settle into funded at the summit (no heli extract).
      const from = { x: player.pos.x, y: player.pos.y };
      passCelebrated = true;
      player.hidden = false;
      facing = "down";
      playIfNeeded("down-idle");
      store.set(boardModeAtom, "eval");
      store.set(summitAwardAtom, "silver");
      store.set(summitGlowAtom, true);
      store.set(evalPassCelebratingAtom, true);
      store.set(accountFailedAtom, false);
      store.set(medalStoredAtom, false);
      store.set(medalIntroPlayedAtom, false);
      store.set(
        summitArrivalNonceAtom,
        store.get(summitArrivalNonceAtom) + 1,
      );
      transition = {
        phase: "pass-claim",
        elapsed: 0,
        duration: 3.2,
        from,
        enterDay,
        reason,
      };
      publishJourney(true, false);
      store.set(
        winningDayStatusAtom,
        "Evaluation passed — claiming the trophy…",
      );
      publishPlayerPosition();
      return;
    }

    // Each account selection replays its progress from base camp.
    transition = null;
    passCelebrated = false;
    extractPlayed = false;
    trailCleared = false;
    player.hidden = false;
    store.set(evalPassCelebratingAtom, false);
    store.set(summitGlowAtom, false);
    store.set(medalCollectingAtom, false);
    store.set(medalStoredAtom, false);
    store.set(medalIntroPlayedAtom, false);
    startJourney({
      fromDay: 0,
      toDay: enterDay,
      snap: true,
      claimAlreadyDone: store.get(claimAlreadyDoneAtom),
    });
    publishPlayerPosition();
  };

  const advanceTransitionPhase = () => {
    if (!transition) return;

    if (transition.phase === "pass-claim") {
      store.set(evalPassCelebratingAtom, false);
      store.set(summitGlowAtom, false);
      store.set(medalStoredAtom, true);
      transition = null;
      // Skip helicopter extract — settle funded state in place after the claim.
      finishPassExtract();
      return;
    }

    if (transition.phase === "heli-approach") {
      // Brief grab beat — trader latches under the heli.
      transition.phase = "heli-grab";
      transition.elapsed = 0;
      transition.duration = 0.28;
      store.set(
        winningDayStatusAtom,
        transition.reason === "fail"
          ? "Grabbing the skid…"
          : "Grabbing the skid…",
      );
      return;
    }

    if (transition.phase === "heli-grab") {
      const hang = transition.hangOffset ?? 36;
      transition.phase = "heli-depart";
      transition.elapsed = 0;
      transition.duration = 1.35;
      transition.from = {
        x: transition.to.x,
        y: transition.to.y,
        playerY: transition.to.y + hang,
      };
      transition.to = {
        x: transition.to.x + 420,
        y: -200,
        playerY: -200 + hang,
      };
      store.set(
        winningDayStatusAtom,
        transition.reason === "fail"
          ? "Extracting…"
          : "Extracting to Certified Funded…",
      );
      return;
    }

    if (transition.phase === "heli-depart") {
      const { enterDay, reason } = transition;
      store.set(summitGlowAtom, false);
      if (reason === "fail") {
        finishFailExtract();
        return;
      }
      finishPassExtract();
      return;
    }

    if (transition.phase === "approach") {
      transition.phase = "loop";
      transition.elapsed = 0;
      transition.duration = 3.6;
      transition.loopOrigin = { ...transition.mid };
      playIfNeeded("right");
      return;
    }

    if (transition.phase === "loop") {
      transition.phase = "exit";
      transition.elapsed = 0;
      transition.duration = 2.4;
      transition.from = { x: player.pos.x, y: player.pos.y };
      transition.to = {
        x: WORLD_WIDTH + 180,
        y: transition.mid.y - 220,
      };
      playIfNeeded("right");
      return;
    }

    if (transition.phase === "exit") {
      const { enterDay, reason } = transition;
      player.hidden = true;
      destroyGlider();
      beginRunIn(enterDay, reason);
    }
  };

  placePlayer(0);
  store.set(winningDayCurrentAtom, 0);
  playIfNeeded("right-idle");
  publishJourney(false, false);

  const completeJourney = () => {
    journeyActive = false;
    publishJourney(false, journeyFromDay !== journeyToDay);

    // Fail exit: finished hopping down — clear the trail instantly.
    if (pendingFailExit) {
      pendingFailExit = null;
      extractPlayed = true;
      finishFailExtract();
      return;
    }

    if (currentDay !== 5 || transition) return;

    const mode = store.get(boardModeAtom);
    if (mode === "eval") {
      // Parent drives pass once from the balance snapshot cross.
      // Hold at summit until that signal arrives — no claim animation.
      facing = "down";
      playIfNeeded("down-idle");
      store.set(
        winningDayStatusAtom,
        "Summit reached — waiting for funded upgrade…",
      );
      return;
    }

    // Funded summit: medal is already on the peak — no fly-in claim.
    store.set(medalStoredAtom, true);
    store.set(medalIntroPlayedAtom, true);
    store.set(medalCollectingAtom, false);
  };

  const beginHop = () => {
    if (currentDay === targetDay) return;
    cancelTapTwist();

    const direction = Math.sign(targetDay - currentDay);
    const from = CHECKPOINTS[currentDay];
    const nextDay = currentDay + direction;
    const to = CHECKPOINTS[nextDay];
    const deltaX = to.x - from.x;
    const deltaY = to.y - from.y;
    const distance = Math.hypot(deltaX, deltaY);

    hop = {
      duration: Math.min(0.86, Math.max(0.52, distance / 215)),
      elapsed: 0,
      from,
      jumpHeight: Math.max(44, Math.abs(deltaY) * 0.36),
      nextDay,
      to,
    };

    if (Math.abs(deltaY) > Math.abs(deltaX) * 1.15) {
      facing = deltaY < 0 ? "up" : "down";
    } else {
      facing = deltaX >= 0 ? "right" : "left";
    }
    playIfNeeded(facing);
    store.set(
      winningDayStatusAtom,
      direction > 0
        ? `Climbing to Day ${nextDay}…`
        : `Returning to Day ${nextDay}…`,
    );
  };

  /**
   * Parent-driven journey request.
   *
   * The parent republishes whenever its balance refreshes (cache paint, live
   * poll, snapshot fallback), so requests arrive mid-hop all the time. A moving
   * trader is never teleported: the current hop lands and the walk continues
   * toward the new day, up or down. Only an explicit `snap` (account swap /
   * replay / settle) places the sprite directly.
   */
  const startJourney = (request) => {
    // Don't interrupt an in-flight account transition.
    if (transition) return;
    cancelTapTwist();

    // Empty post-extract trail — ignore journey hops until a new account runs in.
    if (trailCleared) {
      store.set(claimAlreadyDoneAtom, request.claimAlreadyDone === true);
      player.hidden = true;
      publishJourney(false, false);
      publishPlayerPosition();
      return;
    }

    const requestedFrom = clampDay(request.fromDay);
    const requestedTo = clampDay(request.toDay);
    const snap = request.snap === true || request.replay === true;
    store.set(claimAlreadyDoneAtom, request.claimAlreadyDone === true);

    if (!snap && (hop || journeyActive)) {
      // Mid-journey: retarget without touching the sprite.
      if (targetDay === requestedTo) {
        publishJourney(true, false);
        return;
      }
      targetDay = requestedTo;
      journeyToDay = requestedTo;
      if (!hop && currentDay === targetDay) {
        // Retargeted onto the checkpoint we are standing on: the walk is done.
        nextHopDelay = 0;
        landing = LANDING_DURATION;
        facing = currentDay === 5 || currentDay === 0 ? "right" : "down";
        playIfNeeded(`${facing}-idle`);
        completeJourney();
        return;
      }
      journeyActive = true;
      // Landed between hops (walk-cycle gap): resume toward the new target.
      if (!hop && nextHopDelay <= 0) nextHopDelay = 0.06;
      publishJourney(true, false);
      store.set(
        winningDayStatusAtom,
        targetDay > currentDay
          ? `Climbing to Day ${targetDay}…`
          : targetDay < currentDay
            ? `Returning to Day ${targetDay}…`
            : `Holding at Day ${currentDay}.`,
      );
      return;
    }

    // Idle: continue from where the trader actually stands. The parent's
    // bookkeeping can lag a hop, so its `fromDay` is advisory unless snapping.
    const startDay = snap ? requestedFrom : currentDay;
    journeyFromDay = startDay;
    journeyToDay = requestedTo;
    currentDay = startDay;
    targetDay = requestedTo;
    hop = null;
    landing = 0;
    nextHopDelay = 0;
    journeyActive = currentDay !== targetDay;

    store.set(winningDayCurrentAtom, currentDay);
    placePlayer(currentDay);
    facing =
      targetDay === currentDay
        ? currentDay === 0
          ? "right"
          : "left"
        : targetDay < currentDay
          ? "down"
          : "up";
    playIfNeeded(`${facing}-idle`);
    publishJourney(journeyActive, false);

    if (!journeyActive) {
      store.set(
        winningDayStatusAtom,
        currentDay === 5
          ? request.claimAlreadyDone
            ? "Payout already claimed. Trader ready for more."
            : "Payout eligibility unlocked."
          : currentDay === 0
            ? "At base camp."
            : `Holding at Day ${currentDay}.`,
      );
      return;
    }

    store.set(
      winningDayStatusAtom,
      targetDay > currentDay
        ? `Climbing from Day ${currentDay} to Day ${targetDay}…`
        : `Descending from Day ${currentDay} to Day ${targetDay}…`,
    );
    beginHop();
  };

  store.sub(winningDayRequestAtom, () => {
    const request = store.get(winningDayRequestAtom);
    startJourney(request);
  });

  store.sub(traderTransitionRequestAtom, () => {
    const request = store.get(traderTransitionRequestAtom);
    if (!request?.nonce) return;
    startTraderTransition(request);
  });

  player.onUpdate(() => {
    syncGoldStars();
    if (transition) {
      transition.elapsed += k.dt();
      const progress = Math.min(
        transition.elapsed / Math.max(transition.duration, 0.001),
        1,
      );
      const eased = easeInOut(progress);

      if (transition.phase === "pass-claim") {
        player.scale.x = PLAYER_SCALE;
        player.scale.y = PLAYER_SCALE;
        facing = "down";
        playIfNeeded("down-idle");
        publishPlayerPosition();
        if (progress >= 1) advanceTransitionPhase();
        return;
      }

      if (transition.phase === "heli-approach") {
        const x =
          transition.from.x +
          (transition.to.x - transition.from.x) * eased;
        const y =
          transition.from.y +
          (transition.to.y - transition.from.y) * eased;
        syncHeliAt(x, y);
        facing = "right";
        playIfNeeded("right-idle");
        publishPlayerPosition();
        if (progress >= 1) advanceTransitionPhase();
        return;
      }

      if (transition.phase === "heli-grab") {
        const hang = transition.hangOffset ?? 36;
        const heliX = transition.to.x;
        const heliY = transition.to.y;
        syncHeliAt(heliX, heliY, { wobble: true });
        // Lift the trader onto the skid.
        player.pos.x = heliX;
        player.pos.y =
          player.pos.y +
          (heliY + hang - player.pos.y) * Math.min(1, progress * 2.4);
        player.scale.x = PLAYER_SCALE;
        player.scale.y = PLAYER_SCALE;
        facing = "up";
        playIfNeeded("up-idle");
        publishPlayerPosition();
        if (progress >= 1) advanceTransitionPhase();
        return;
      }

      if (transition.phase === "heli-depart") {
        const hang = transition.hangOffset ?? 36;
        const x =
          transition.from.x +
          (transition.to.x - transition.from.x) * eased;
        const y =
          transition.from.y +
          (transition.to.y - transition.from.y) * eased;
        syncHeliAt(x, y);
        player.pos.x = x;
        player.pos.y = y + hang;
        player.scale.x = PLAYER_SCALE * (1 - progress * 0.08);
        player.scale.y = PLAYER_SCALE * (1 - progress * 0.08);
        facing = "up";
        playIfNeeded("up-idle");
        publishPlayerPosition();
        if (progress >= 1) advanceTransitionPhase();
        return;
      }

      if (transition.phase === "second-run") {
        const runFacing = transition.facing === "left" ? "left" : "right";
        if (secondRunner) {
          secondRunner.pos.x =
            transition.from.x +
            (transition.to.x - transition.from.x) * eased;
          secondRunner.pos.y = transition.to.y;
          if (secondRunner.getCurAnim()?.name !== runFacing) {
            secondRunner.play(runFacing);
          }
        }
        facing = "down";
        playIfNeeded("down-idle");
        publishPlayerPosition();
        if (progress < 1) return;

        const day = transition.enterDay;
        // Handoff: funded runner becomes the active trader at day 0.
        if (secondRunner) {
          player.pos.x = secondRunner.pos.x;
          player.pos.y = secondRunner.pos.y;
          player.hidden = false;
          destroySecondRunner();
        }
        destroyLetter();
        transition = null;
        currentDay = day;
        targetDay = day;
        journeyFromDay = day;
        journeyToDay = day;
        placePlayer(day);
        facing = "down";
        playIfNeeded("down-idle");
        landing = LANDING_DURATION;
        publishJourney(false, false);
        store.set(winningDayCurrentAtom, day);
        store.set(
          winningDayStatusAtom,
          "Certified Funded — gold stars mark each winning day.",
        );
        return;
      }

      if (transition.phase === "approach") {
        const bob = Math.sin(progress * Math.PI) * 18;
        player.pos.x =
          transition.from.x +
          (transition.mid.x - transition.from.x) * eased;
        player.pos.y =
          transition.from.y +
          (transition.mid.y - transition.from.y) * eased -
          bob;
        player.scale.x = PLAYER_SCALE;
        player.scale.y = PLAYER_SCALE;
        if (glider) {
          glider.pos.x = player.pos.x + 8;
          glider.pos.y = player.pos.y - 54 - Math.sin(progress * Math.PI) * 8;
          glider.angle = -14 - progress * 6;
        }
        playIfNeeded("right");
        publishPlayerPosition();
        if (progress >= 1) advanceTransitionPhase();
        return;
      }

      if (transition.phase === "loop") {
        const turns = transition.loopTurns ?? 1.25;
        const angle = progress * Math.PI * 2 * turns - Math.PI / 2;
        const radiusX = 110;
        const radiusY = 58;
        player.pos.x = transition.loopOrigin.x + Math.cos(angle) * radiusX;
        player.pos.y = transition.loopOrigin.y + Math.sin(angle) * radiusY;
        player.scale.x = PLAYER_SCALE;
        player.scale.y = PLAYER_SCALE;
        if (glider) {
          glider.pos.x = player.pos.x + Math.cos(angle) * 10;
          glider.pos.y = player.pos.y - 52;
          glider.angle = (angle * 180) / Math.PI * 0.15 - 16;
        }
        playIfNeeded("right");
        publishPlayerPosition();
        if (progress >= 1) advanceTransitionPhase();
        return;
      }

      if (transition.phase === "exit") {
        const bob = Math.sin(progress * Math.PI * 1.6) * 12;
        player.pos.x =
          transition.from.x +
          (transition.to.x - transition.from.x) * eased;
        player.pos.y =
          transition.from.y +
          (transition.to.y - transition.from.y) * eased +
          bob;
        player.scale.x = PLAYER_SCALE * (1 - progress * 0.12);
        player.scale.y = PLAYER_SCALE * (1 - progress * 0.12);
        if (glider) {
          glider.pos.x = player.pos.x + 8;
          glider.pos.y = player.pos.y - 52;
          glider.angle = -20 - progress * 18;
        }
        playIfNeeded("right");
        publishPlayerPosition();
        if (progress >= 1) advanceTransitionPhase();
        return;
      }

      if (transition.phase === "run") {
        player.pos.x =
          transition.from.x +
          (transition.to.x - transition.from.x) * eased;
        player.pos.y = transition.to.y;
        player.scale.x = PLAYER_SCALE;
        player.scale.y = PLAYER_SCALE;
        playIfNeeded("right");
        publishPlayerPosition();

        if (progress < 1) return;

        const day = transition.enterDay;
        const reason = transition.reason;
        transition = null;
        currentDay = day;
        targetDay = day;
        placePlayer(day);
        facing = reason === "pass" ? "down" : "right";
        playIfNeeded(reason === "pass" ? "down-idle" : "right-idle");
        landing = LANDING_DURATION;
        publishJourney(false, false);
        store.set(winningDayCurrentAtom, day);
        store.set(
          winningDayStatusAtom,
          reason === "pass"
            ? "Certified Funded account ready."
            : day === 0
              ? "New account ready at base camp."
              : `New account holding at Day ${day}.`,
        );
        return;
      }
    }

    if (!hop) {
      if (tapTwist) {
        tapTwist.elapsed += k.dt();
        const progress = Math.min(tapTwist.elapsed / tapTwist.duration, 1);
        // Ease out and back: peak at 25°, settle to 0.
        const swing = Math.sin(progress * Math.PI);
        player.angle = tapTwist.direction * TAP_ROTATE_DEG * swing;
        playIfNeeded("down-idle");
        if (progress >= 1) cancelTapTwist();
      }

      if (landing > 0) {
        landing = Math.max(landing - k.dt(), 0);
        const settle = Math.sin((landing / LANDING_DURATION) * Math.PI) * 0.3;
        player.scale.x = PLAYER_SCALE + settle;
        player.scale.y = PLAYER_SCALE - settle;
      }

      if (nextHopDelay > 0) {
        nextHopDelay -= k.dt();
        if (nextHopDelay <= 0 && currentDay !== targetDay) beginHop();
      }
      return;
    }

    hop.elapsed += k.dt();
    const progress = Math.min(hop.elapsed / hop.duration, 1);
    // Constant travel speed with a sine arc keeps the leap from stalling midair.
    const arc = Math.sin(progress * Math.PI);

    player.pos.x = hop.from.x + (hop.to.x - hop.from.x) * progress;
    player.pos.y =
      hop.from.y + (hop.to.y - hop.from.y) * progress - arc * hop.jumpHeight;

    const stretch = arc * 0.26;
    player.scale.x = PLAYER_SCALE - stretch;
    player.scale.y = PLAYER_SCALE + stretch;
    publishPlayerPosition();

    if (progress < 1) return;

    currentDay = hop.nextDay;
    hop = null;
    placePlayer(currentDay);
    landing = LANDING_DURATION;
    store.set(winningDayCurrentAtom, currentDay);

    if (currentDay !== targetDay) {
      // Keep the walk cycle running between checkpoints so it does not flicker.
      nextHopDelay = 0.06;
      return;
    }

    facing = currentDay === 5 || currentDay === 0 ? "right" : "down";
    playIfNeeded(`${facing}-idle`);
    completeJourney();
    store.set(
      winningDayStatusAtom,
      currentDay === 5
        ? store.get(claimAlreadyDoneAtom)
          ? "Payout already claimed. Trader ready for more."
          : "Payout eligibility unlocked."
        : currentDay === 0
          ? "Returned to base camp."
          : `Day ${currentDay} PNL checkpoint reached.`,
    );
  });
}

function clampDay(value) {
  const day = Number.parseInt(value, 10);
  return Number.isFinite(day) ? Math.max(0, Math.min(5, day)) : 0;
}

function pnlNumber(value) {
  const numeric =
    typeof value === "number"
      ? value
      : Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function applySignLine(kaplay, line, text, color, size) {
  const content = text.trim() ? text : " ";
  const tint = kaplay.rgb(...color);
  if (size != null) {
    line.front.textSize = size;
    line.shadow.textSize = size;
    line.outline.forEach((layer) => {
      layer.textSize = size;
    });
  }
  line.front.text = content;
  line.shadow.text = content;
  line.front.color = tint;
  line.shadow.color = kaplay.rgb(...SIGN_SHADOW_COLOR);
  line.outline.forEach((layer) => {
    layer.text = content;
  });
}

function setSignLineVisible(line, visible) {
  line.front.hidden = !visible;
  line.shadow.hidden = !visible;
  line.outline.forEach((layer) => {
    layer.hidden = !visible;
  });
}

function createGoldStarTexture() {
  // 13×13 five-point pixel star: dark outline, gold fill, a highlight on the
  // upper-left facets and shade on the lower legs so it reads as a star at
  // the 2.2× sprite scale instead of a yellow blob.
  const canvas = document.createElement("canvas");
  canvas.width = 13;
  canvas.height = 13;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const pixels = [
    "......O......",
    ".....OYO.....",
    ".....OHO.....",
    "....OHYYO....",
    "OOOOOHYYYOOOO",
    ".OHHYYYYYYYO.",
    "..OYYYYYYYO..",
    "...OYYYYYO...",
    "...OYYyYYO...",
    "..OYyYOYyYO..",
    "..OyyO.OyyO..",
    ".OyO.....OyO.",
    ".OO.......OO.",
  ];
  const colors = {
    O: "#3b2a0a",
    Y: "#f4c542",
    H: "#fff3c4",
    y: "#d79d1e",
  };
  for (let row = 0; row < pixels.length; row += 1) {
    for (let col = 0; col < pixels[row].length; col += 1) {
      const key = pixels[row][col];
      if (!colors[key]) continue;
      ctx.fillStyle = colors[key];
      ctx.fillRect(col, row, 1, 1);
    }
  }
  return canvas.toDataURL();
}

function signPnlLabel(value) {
  const safeValue = pnlNumber(value);
  const sign = safeValue < 0 ? "-" : "";
  return `${sign}$${Math.abs(safeValue).toLocaleString("en-US", {
    maximumFractionDigits: 0,
  })}`;
}

function signPnlColor(value) {
  const safeValue = pnlNumber(value);
  if (safeValue === 0) return PNL_ZERO_COLOR;
  if (safeValue < 0) return PNL_NEGATIVE_COLOR;
  return PNL_POSITIVE_COLOR;
}
