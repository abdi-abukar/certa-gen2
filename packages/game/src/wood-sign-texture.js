// Pixel-art trail sign shared by the main board and the climb loop.
export function createWoodSignTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 48;
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = false;

  const rect = (x, y, width, height, color) => {
    context.fillStyle = color;
    context.fillRect(x, y, width, height);
  };

  // Thick post and small grounded stone base.
  rect(29, 24, 7, 22, "#3d2414");
  rect(31, 24, 4, 22, "#9a5727");
  rect(22, 43, 21, 4, "#28322b");
  rect(25, 41, 15, 4, "#6f7254");

  // Three uneven timber planks with pixel-cut ends.
  rect(5, 3, 54, 9, "#3d2414");
  rect(3, 12, 57, 10, "#3d2414");
  rect(6, 22, 51, 9, "#3d2414");
  rect(7, 4, 49, 7, "#d9872d");
  rect(5, 13, 52, 8, "#c87524");
  rect(8, 23, 46, 7, "#b86621");

  // Warm highlights, grain, and nail heads.
  rect(10, 5, 39, 1, "#f0ad48");
  rect(8, 14, 44, 1, "#e69a38");
  rect(12, 24, 34, 1, "#dc8830");
  rect(16, 8, 18, 1, "#9f541f");
  rect(30, 17, 20, 1, "#8d481d");
  rect(13, 27, 14, 1, "#87431b");
  rect(9, 8, 2, 2, "#5a351d");
  rect(53, 16, 2, 2, "#5a351d");
  rect(11, 26, 2, 2, "#5a351d");

  return canvas.toDataURL();
}
