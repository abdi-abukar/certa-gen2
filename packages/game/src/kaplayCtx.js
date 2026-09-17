import kaplay from "kaplay";

export default function initKaplay() {
  return kaplay({
    background: "#18272a",
    global: false,
    debug: true, // put back to false in prod
    debugKey: "f1",
    canvas: document.getElementById("game"),
    pixelDensity: devicePixelRatio,
    crisp: true,
  });
}
