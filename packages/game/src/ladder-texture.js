/** Pixel rope ladder for heli extractions. */
export function createLadderTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = false;

  const rect = (x, y, width, height, color) => {
    context.fillStyle = color;
    context.fillRect(x, y, width, height);
  };

  // Side ropes
  rect(3, 0, 2, 64, "#6b4423");
  rect(11, 0, 2, 64, "#6b4423");
  rect(3, 0, 2, 64, "#8a5a2b");
  rect(4, 0, 1, 64, "#c4924a");
  rect(11, 0, 1, 64, "#c4924a");

  // Rungs
  for (let y = 4; y < 64; y += 8) {
    rect(3, y, 10, 2, "#a8741f");
    rect(4, y, 8, 1, "#e2b35a");
  }

  return canvas.toDataURL();
}
