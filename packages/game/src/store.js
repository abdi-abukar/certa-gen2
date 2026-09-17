import { atom, createStore } from "jotai";

export const isTextBoxVisibleAtom = atom(false);
export const textBoxContentAtom = atom("");

// Each request includes a nonce so the same from/to journey can be replayed.
export const winningDayRequestAtom = atom({
  fromDay: 0,
  toDay: 0,
  nonce: 0,
  replay: false,
  /** Place the sprite directly instead of retargeting a walk in progress. */
  snap: false,
  claimAlreadyDone: false,
});
export const winningDayCurrentAtom = atom(0);
export const winningDayStatusAtom = atom("Choose a winning day to begin.");
export const winningDayJourneyAtom = atom({
  fromDay: 0,
  toDay: 0,
  isMoving: false,
  canReplay: false,
});
export const winningDayPlayerPositionAtom = atom({ x: 260, y: 945 });
export const claimAlreadyDoneAtom = atom(false);
// The medal glide-in is a one-time reveal, so it never replays for this session.
export const medalIntroPlayedAtom = atom(false);
export const medalStoredAtom = atom(false);
export const medalCollectingAtom = atom(false);
export const summitArrivalNonceAtom = atom(0);
export const pnlValuesAtom = atom([0, 0, 0, 0]);
export const pnlDatesAtom = atom(["", "", "", ""]);
export const payoutMinimumMetAtom = atom(false);
export const payoutMinimumAmountAtom = atom(1000);
export const payoutAvailableAmountAtom = atom(0);
export const greenDaysCompleteAtom = atom(false);
export const boardModeAtom = atom("eval");
export const evalBalanceAtom = atom(null);
/** Eval uses silver → trophy.glb; funded uses bronze then crown. */
export const summitAwardAtom = atom("silver");
export const paidPayoutsAtom = atom(0);
export const tierProfitRequiredAtom = atom(2000);

/** Glide off-screen then run the next trader in from the left. */
export const traderTransitionRequestAtom = atom({
  nonce: 0,
  reason: "swap",
  toDay: 0,
});

/** Summit trophy stays put and glows during instant pass. */
export const summitGlowAtom = atom(false);

/** Eval instant-pass celebration (fireworks + face camera). */
export const evalPassCelebratingAtom = atom(false);

/** One-shot summit fireworks while Tradara verifies the pass. */
export const summitFireworksActiveAtom = atom(false);

/** Small nametag shown above the trader. */
export const traderNameAtom = atom("");

/** Palette-swapped walker look from the Certa dashboard. */
export const characterLookAtom = atom(null);

/** Eval account breached — show permanent start-new prompt by the reward. */
export const accountFailedAtom = atom(false);

/** No evaluation yet — keep the summit trophy up and prompt to start. */
export const needsEvalAtom = atom(false);

/** Bump to restore a previously extracted fail without replaying the heli. */
export const failedTrailRestoredAtom = atom(0);

/** Funded green / winning days — gold stars over the trader's head. */
export const greenDayCountAtom = atom(0);

/** Drop the next funded summit reward (bronze / crown) into place. */
export const rewardDropNonceAtom = atom(0);

export const store = createStore();
