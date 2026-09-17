/**
 * Certa certificate artwork specs.
 *
 * Every spec pairs a text-free plate (public/certs, public/ticket-share) with
 * the text layout exported from the design editors kept in public/certs/*.html.
 * Coordinates live in the plate's own pixel space; the canvas engine scales
 * them for exports and previews.
 */

export type CertTextStyle = {
  /** Centre of the run, or the left / right edge when `align` says so. */
  x: number;
  y: number;
  align?: "left" | "center" | "right";
  family: string;
  size: number;
  weight?: number;
  /** Extra pixels between glyphs. */
  tracking?: number;
  /** Horizontal squeeze / stretch of the glyphs. */
  scaleX?: number;
  /** Rotation in degrees. */
  rot?: number;
  /** Vertical gradient stops, top to bottom. */
  colors: string[];
  outline?: { color: string; width: number };
  extrude?: { color: string; dx: number; dy: number; depth: number };
  shadow?: { color: string; blur: number; dx: number; dy: number };
  shadow2?: { color: string; blur: number; dx: number; dy: number };
  glow?: { color: string; blur: number };
  /** Shrinks the type until the run fits inside this many plate pixels. */
  maxWidth?: number;
  uppercase?: boolean;
};

export type CertFont = { family: string; url: string; weight?: string };

export type CertSpec<K extends string = string> = {
  id: string;
  width: number;
  height: number;
  plate: string;
  fonts: CertFont[];
  layout: Record<K, CertTextStyle>;
  defaults: Record<K, string>;
  /** Multiplier applied to the plate size for downloads. */
  exportScale: number;
};

export const CERT_FONTS = {
  inter: { family: "Inter", url: "/certs/fonts/inter.ttf", weight: "100 900" },
  jersey: { family: "Jersey 10", url: "/certs/fonts/jersey10.ttf", weight: "400" },
  allura: { family: "Allura", url: "/certs/fonts/allura.ttf", weight: "400" },
  pressStart: {
    family: "Press Start 2P",
    url: "/certs/fonts/press-start-2p.ttf",
    weight: "400",
  },
} satisfies Record<string, CertFont>;

/* ------------------------------------------------------------------ */
/* Losing trade / day / month card (public/certs/certa-loss.html)      */
/* ------------------------------------------------------------------ */

const PIX = CERT_FONTS.jersey.family;

const WHITE_BEVEL = {
  colors: ["#fbfcfd", "#f1efec", "#d6cfcc", "#c6c1c0"],
  outline: { color: "#1c1a2e", width: 2.2 },
  extrude: { color: "#8e8a8c", dx: 1, dy: 1.2, depth: 4 },
  shadow: { color: "rgba(0,0,0,.55)", blur: 0, dx: 6, dy: 8 },
};
const RED_BEVEL = {
  colors: ["#ff2a24", "#f3181a", "#dc1519", "#c40e16"],
  outline: { color: "#4a0709", width: 2.6 },
  extrude: { color: "#7c0e11", dx: 1, dy: 1.2, depth: 5 },
  shadow: { color: "rgba(60,0,0,.55)", blur: 0, dx: 6, dy: 8 },
  glow: { color: "rgba(255,40,30,.45)", blur: 16 },
};
const SMALL_BEVEL = {
  colors: ["#f2f2f5", "#e9e8ea", "#cfcecf"],
  outline: { color: "#1c1a2e", width: 1.6 },
  extrude: { color: "#7a777c", dx: 1, dy: 1, depth: 2 },
  shadow: { color: "rgba(0,0,0,.5)", blur: 0, dx: 3, dy: 4 },
};
const RED_LABEL = {
  colors: ["#e8453f", "#dc3b3d"],
  shadow: { color: "rgba(0,0,0,.55)", blur: 2, dx: 1, dy: 2 },
};
const WHITE_LABEL = {
  colors: ["#eeedf1", "#e6e6ea"],
  shadow: { color: "rgba(0,0,0,.55)", blur: 2, dx: 1, dy: 2 },
};
const SIGN_TEXT = {
  colors: ["#f6f4f0", "#e2dfd8"],
  outline: { color: "#3a2412", width: 1.6 },
  shadow: { color: "rgba(20,8,0,.6)", blur: 0, dx: 2, dy: 2 },
};

export type LossCardField =
  | "brand"
  | "title"
  | "handle"
  | "symbol"
  | "symbolLabel"
  | "pnl"
  | "pnlLabel"
  | "contracts"
  | "contractsLabel"
  | "held"
  | "heldLabel"
  | "entry"
  | "entryLabel"
  | "sign1"
  | "sign2"
  | "site";

export const LOSS_CARD: CertSpec<LossCardField> = {
  id: "loss",
  width: 1535,
  height: 1024,
  plate: "/certs/loss-plate.webp",
  fonts: [CERT_FONTS.inter, CERT_FONTS.jersey],
  exportScale: 2,
  layout: {
    brand: { x: 173, y: 72, align: "left", family: PIX, size: 22, tracking: 4.3, maxWidth: 520, ...WHITE_LABEL },
    title: {
      x: 173, y: 106, align: "left", family: PIX, size: 52, tracking: 2.5, scaleX: 1.15, maxWidth: 820,
      colors: ["#f8f9fa", "#ebeaec", "#d0cfd3", "#c1c0c6"],
      outline: { color: "#1c1a2e", width: 1.8 },
      extrude: { color: "#6f6e74", dx: 1, dy: 1, depth: 2 },
      shadow: { color: "rgba(0,0,0,.5)", blur: 0, dx: 3, dy: 4 },
    },
    handle: { x: 772.5, y: 217.5, family: PIX, size: 31, tracking: 3.4, maxWidth: 760, ...WHITE_LABEL },
    symbol: { x: 445.5, y: 344, family: PIX, size: 219, tracking: 4, scaleX: 1.05, maxWidth: 350, ...WHITE_BEVEL },
    symbolLabel: { x: 449.5, y: 441.5, family: PIX, size: 31, tracking: 5.1, maxWidth: 340, ...RED_LABEL },
    pnl: { x: 994, y: 345, family: PIX, size: 226, tracking: -3, scaleX: 0.92, maxWidth: 660, ...RED_BEVEL },
    pnlLabel: { x: 980.5, y: 441.5, family: PIX, size: 31, tracking: 4.7, maxWidth: 640, ...RED_LABEL },
    contracts: { x: 468.5, y: 627, family: PIX, size: 59, tracking: 0, scaleX: 0.85, maxWidth: 240, ...SMALL_BEVEL },
    contractsLabel: { x: 471.5, y: 671.5, family: PIX, size: 28, tracking: 3.6, maxWidth: 250, ...RED_LABEL },
    held: { x: 751.5, y: 627.5, family: PIX, size: 61, tracking: 1.5, scaleX: 1.08, maxWidth: 250, ...SMALL_BEVEL },
    heldLabel: { x: 749, y: 671.5, family: PIX, size: 28, tracking: 5.2, maxWidth: 260, ...RED_LABEL },
    entry: { x: 1058, y: 627.5, family: PIX, size: 61, tracking: 1, scaleX: 1.08, maxWidth: 250, ...SMALL_BEVEL },
    entryLabel: { x: 1060, y: 671.5, family: PIX, size: 28, tracking: 4.4, maxWidth: 260, ...RED_LABEL },
    sign1: { x: 1354, y: 568.5, family: PIX, size: 37, tracking: 2, maxWidth: 132, ...SIGN_TEXT },
    sign2: { x: 1340.5, y: 602.5, family: PIX, size: 37, tracking: 0, maxWidth: 132, ...SIGN_TEXT },
    site: {
      x: 1285, y: 969.5, align: "left", family: "Inter", size: 17, weight: 500, tracking: 2, maxWidth: 235,
      colors: ["#eaeaee", "#dcdce2"],
      shadow: { color: "rgba(0,0,0,.6)", blur: 3, dx: 0, dy: 1 },
    },
  },
  defaults: {
    brand: "CERTA FUTURES",
    title: "INDIVIDUAL TRADE",
    handle: "@TRADERNAME",
    symbol: "NQ",
    symbolLabel: "SYMBOL",
    pnl: "-$1,487.50",
    pnlLabel: "P&L",
    contracts: "3",
    contractsLabel: "CONTRACTS",
    held: "12M 48S",
    heldLabel: "TIME HELD",
    entry: "09:42 AM",
    entryLabel: "ENTRY TIME",
    sign1: "ROUGH",
    sign2: "TRADE",
    site: "CERTAFUTURES.COM",
  },
};

/* ------------------------------------------------------------------ */
/* Payout certificate (public/certs/certa-payout-editor.html)          */
/* ------------------------------------------------------------------ */

const PAYOUT_SMALL = {
  colors: ["#5a9a42", "#4c8a31"],
  shadow: { color: "rgba(0,0,0,.5)", blur: 3, dx: 0, dy: 1 },
};
const PAYOUT_BIG = {
  colors: ["#f0f1f3", "#e2e0e0"],
  shadow: { color: "rgba(0,0,0,.6)", blur: 6, dx: 0, dy: 2 },
};
const PAYOUT_SIGNATURE = {
  colors: ["#ecd48c", "#d7b76d", "#e3bf74"],
  shadow: { color: "rgba(0,0,0,.55)", blur: 5, dx: 0, dy: 2 },
};
const PAYOUT_SIGN_TITLE = {
  colors: ["#559a3c", "#4a8b30"],
  shadow: { color: "rgba(0,0,0,.5)", blur: 3, dx: 0, dy: 1 },
};

export type PayoutCertField =
  | "site"
  | "certNo"
  | "handle"
  | "amount"
  | "certified"
  | "cycle"
  | "date"
  | "cycleLabel"
  | "dateLabel"
  | "sig1"
  | "sig2"
  | "title1"
  | "title2"
  | "day";

export const PAYOUT_CERT: CertSpec<PayoutCertField> = {
  id: "payout",
  width: 1672,
  height: 941,
  plate: "/certs/payout-plate.webp",
  fonts: [CERT_FONTS.inter, CERT_FONTS.allura],
  exportScale: 2,
  layout: {
    site: {
      x: 80, y: 44.5, align: "left", family: "Inter", size: 17, weight: 500, tracking: 2.7, maxWidth: 320,
      colors: ["#e8e9eb", "#dcdde0"],
      shadow: { color: "rgba(0,0,0,.5)", blur: 3, dx: 0, dy: 1 },
    },
    certNo: {
      x: 1592, y: 44.5, align: "right", family: "Inter", size: 15, weight: 500, tracking: 2.2, maxWidth: 460,
      colors: ["#c9ccd0", "#b9bcc1"],
      shadow: { color: "rgba(0,0,0,.5)", blur: 3, dx: 0, dy: 1 },
    },
    handle: {
      x: 842.5, y: 395, family: "Inter", size: 22, weight: 500, tracking: 2.3, maxWidth: 720,
      colors: ["#f0f2f4", "#e4e6e9"],
      shadow: { color: "rgba(0,0,0,.5)", blur: 4, dx: 0, dy: 1 },
    },
    amount: {
      x: 845.5, y: 492, family: "Inter", size: 138, weight: 800, tracking: -3, scaleX: 0.9, maxWidth: 900,
      colors: ["#a6d27a", "#8fc460", "#6cab3d", "#4e9127", "#387a20", "#316d1c"],
      shadow: { color: "rgba(110,210,70,.45)", blur: 28, dx: 0, dy: 0 },
      shadow2: { color: "rgba(0,0,0,.55)", blur: 10, dx: 0, dy: 6 },
    },
    certified: {
      x: 845, y: 579.5, family: "Inter", size: 26, weight: 500, tracking: 12.5, maxWidth: 1040,
      colors: ["#4f8c37", "#4a8631"],
      shadow: { color: "rgba(0,0,0,.5)", blur: 4, dx: 0, dy: 2 },
    },
    cycle: { x: 617, y: 663, family: "Inter", size: 47, weight: 700, tracking: 1, maxWidth: 320, ...PAYOUT_BIG },
    date: { x: 1034.5, y: 663, family: "Inter", size: 47, weight: 700, tracking: 1, maxWidth: 380, ...PAYOUT_BIG },
    cycleLabel: { x: 622, y: 707, family: "Inter", size: 19, weight: 500, tracking: 2.3, maxWidth: 320, ...PAYOUT_SMALL },
    dateLabel: { x: 1029.5, y: 707, family: "Inter", size: 19, weight: 500, tracking: 2.3, maxWidth: 320, ...PAYOUT_SMALL },
    sig1: { x: 650.5, y: 784, family: "Allura", size: 50, weight: 400, tracking: 0, maxWidth: 330, ...PAYOUT_SIGNATURE },
    sig2: { x: 1051.5, y: 784, family: "Allura", size: 57, weight: 400, tracking: 0, maxWidth: 330, ...PAYOUT_SIGNATURE },
    title1: { x: 648.5, y: 837, family: "Inter", size: 19, weight: 500, tracking: 4.1, maxWidth: 330, ...PAYOUT_SIGN_TITLE },
    title2: { x: 1039, y: 837, family: "Inter", size: 19, weight: 500, tracking: 4.1, maxWidth: 330, ...PAYOUT_SIGN_TITLE },
    day: {
      x: 165.5, y: 531, family: "Inter", size: 48, weight: 700, tracking: 0, scaleX: 0.8, rot: -1, maxWidth: 168,
      colors: ["#c4c6c5", "#aeb1b0", "#bbbab6"],
      shadow: { color: "rgba(0,0,0,.8)", blur: 2, dx: 1, dy: 2 },
    },
  },
  defaults: {
    site: "CERTAFUTURES.COM",
    certNo: "",
    handle: "@TRADERNAME",
    amount: "+$3,500.00",
    certified: "CERTIFIED FUNDED PAYOUT",
    cycle: "01",
    date: "08.29.2026",
    cycleLabel: "CYCLE",
    dateLabel: "PAID",
    sig1: "Anish Ayyadevara",
    sig2: "Abdi Abukar",
    title1: "CO FOUNDER",
    title2: "FOUNDER",
    day: "BRONZE",
  },
};

/* ------------------------------------------------------------------ */
/* Passed certificate (public/certs/Certa_Futures_50K_Certificate.html) */
/* Certa runs a single 50K evaluation, so the plate carries the size.   */
/* ------------------------------------------------------------------ */

export type PassedCertField = "name" | "date";

export const PASSED_CERT: CertSpec<PassedCertField> = {
  id: "passed",
  width: 2000,
  height: 1600,
  plate: "/certs/passed-50k.png",
  fonts: [CERT_FONTS.pressStart],
  exportScale: 1,
  layout: {
    name: {
      x: 80, y: 460, align: "left", family: CERT_FONTS.pressStart.family, size: 28, tracking: 0, maxWidth: 900,
      colors: ["#fffdf6"], uppercase: true,
    },
    date: {
      x: 1930, y: 68, align: "right", family: CERT_FONTS.pressStart.family, size: 16, tracking: 0, maxWidth: 520,
      colors: ["#c6d0c2"], uppercase: true,
    },
  },
  defaults: {
    name: "NAME GOES HERE",
    date: "SEPTEMBER 1, 2026",
  },
};

/* ------------------------------------------------------------------ */
/* Won ticket artwork (public/certs/ticket.html)                        */
/* Rendered server-side for the share page; the numbers live here so   */
/* both renderers agree.                                                */
/* ------------------------------------------------------------------ */

/** The ticket's rotation inside the scene. */
export const TICKET_TILT = -3.4;

export type TicketArtField =
  | "title"
  | "headline"
  | "subline"
  | "numLabel"
  | "username";

export const TICKET_ART: CertSpec<TicketArtField> = {
  id: "ticket",
  width: 1408,
  height: 1408,
  plate: "/ticket-share/ticket-artwork.webp",
  fonts: [CERT_FONTS.inter],
  exportScale: 1,
  layout: {
    title: {
      x: 684, y: 138, family: "Inter", size: 132, weight: 500, tracking: -6, maxWidth: 1200,
      colors: ["#eccd7b", "#e2b95c"],
      shadow: { color: "rgba(8,14,6,.55)", blur: 9, dx: 0, dy: 5 },
    },
    headline: {
      x: 766, y: 730, family: "Inter", size: 95, weight: 700, tracking: -1.2, rot: TICKET_TILT, maxWidth: 760,
      colors: ["#f4e6b6", "#eccb80", "#dfae55", "#e6bd68"],
      shadow: { color: "rgba(0,12,6,.5)", blur: 9, dx: 2, dy: 4 },
    },
    subline: {
      x: 773, y: 826, family: "Inter", size: 30, weight: 400, tracking: -0.4, rot: TICKET_TILT, maxWidth: 800,
      colors: ["#8a8776", "#736e5d"],
      shadow: { color: "rgba(0,10,5,.4)", blur: 4, dx: 1, dy: 2 },
    },
    numLabel: {
      x: 135, y: 507, family: "Inter", size: 16, weight: 500, tracking: 0.5, rot: TICKET_TILT, maxWidth: 120,
      colors: ["#75776a", "#666857"],
      shadow: { color: "rgba(0,0,0,.3)", blur: 2, dx: 0, dy: 1 },
    },
    username: {
      x: 169, y: 785, family: "Inter", size: 38, weight: 500, tracking: 3.3, rot: -90 + TICKET_TILT, maxWidth: 560,
      colors: ["#c2a273", "#9d7c48"],
      shadow: { color: "rgba(0,8,4,.45)", blur: 5, dx: 1, dy: 2 },
    },
  },
  defaults: {
    title: "Certa Tickets",
    headline: "15% off",
    subline: "off a futures evaluation",
    numLabel: "No.",
    username: "@USERNAME",
  },
};
