/** Pixel hang-glider canopy for trader exit transitions. */
export function createGliderTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 48;
  canvas.height = 24;
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = false;

  const rect = (x, y, width, height, color) => {
    context.fillStyle = color;
    context.fillRect(x, y, width, height);
  };

  // Wing canopy
  rect(2, 8, 44, 5, "#2c2418");
  rect(4, 6, 40, 5, "#d4a24a");
  rect(8, 5, 32, 3, "#f0c56a");
  rect(14, 4, 20, 2, "#ffe29a");

  // Rib lines
  rect(12, 6, 1, 6, "#8a5a22");
  rect(24, 5, 1, 7, "#8a5a22");
  rect(36, 6, 1, 6, "#8a5a22");

  // Nose + control bar
  rect(22, 10, 4, 2, "#3d2a14");
  rect(23, 12, 2, 8, "#5a3b1c");
  rect(18, 18, 12, 2, "#3d2a14");

  return canvas.toDataURL();
}
