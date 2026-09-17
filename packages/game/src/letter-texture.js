/** Pixel sealed letter / envelope for the funded offer drop. */
export function createLetterTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 24;
  canvas.height = 18;
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = false;

  const rect = (x, y, width, height, color) => {
    context.fillStyle = color;
    context.fillRect(x, y, width, height);
  };

  // Envelope body
  rect(1, 4, 22, 13, "#f4ead0");
  rect(1, 4, 22, 2, "#e2d2a8");
  rect(2, 5, 20, 11, "#fff6df");

  // Flap
  rect(1, 4, 22, 1, "#c9a45a");
  for (let i = 0; i < 11; i += 1) {
    rect(1 + i, 4 + i, 1, 1, "#d4b06a");
    rect(22 - i, 4 + i, 1, 1, "#d4b06a");
  }
  rect(11, 9, 2, 2, "#c9922e");
  rect(10, 10, 4, 1, "#a8741f");

  // Wax seal
  rect(10, 11, 4, 3, "#a33131");
  rect(11, 12, 2, 1, "#d45a4a");

  return canvas.toDataURL();
}
