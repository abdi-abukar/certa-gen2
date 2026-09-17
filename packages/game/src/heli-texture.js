/** Tiny pixel helicopter for ladder extract. */
export function createHeliTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 48;
  canvas.height = 28;
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = false;

  const rect = (x, y, width, height, color) => {
    context.fillStyle = color;
    context.fillRect(x, y, width, height);
  };

  // Rotor blur
  rect(4, 4, 40, 2, "#d8dde4");
  rect(8, 3, 32, 1, "#f2f5f8");
  // Mast
  rect(23, 5, 2, 4, "#4a5560");
  // Body
  rect(14, 9, 20, 8, "#5fc47c");
  rect(16, 10, 16, 5, "#7ed99a");
  rect(18, 11, 6, 3, "#c8f0d4");
  // Tail
  rect(34, 11, 10, 3, "#4fa86c");
  rect(42, 8, 2, 8, "#3d8456");
  // Skids
  rect(16, 18, 16, 2, "#3d2a14");
  rect(15, 17, 2, 4, "#3d2a14");
  rect(31, 17, 2, 4, "#3d2a14");
  // Hook
  rect(23, 20, 2, 6, "#8a5a22");

  return canvas.toDataURL();
}
