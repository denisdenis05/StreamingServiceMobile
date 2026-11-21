export const PlayingControlGeometry = Object.freeze({
  canvasSize: 50,
  centerDivision: 2,
  minimumOffset: 0,
  glyphs: {
    shuffle: { left: 1.5625, top: 2.0022, width: 46.89715, height: 45.98834 },
    previous: {
      left: 3.23121,
      top: 10.88964,
      width: 43.35219,
      height: 28.22093,
    },
    play: { left: 8.33325, top: 4.16602, width: 39.58205, height: 41.66791 },
    pause: { left: 3.33325, top: 3.33325, width: 41.66667, height: 43.33335 },
    next: { left: 3.41675, top: 10.88964, width: 43.35215, height: 28.22093 },
    repeat: { left: 0, top: 0, width: 50, height: 50 },
    repeatOnce: { left: 0, top: 0, width: 50, height: 50 },
  },
});
export type PlayingControlGlyph = keyof typeof PlayingControlGeometry.glyphs;
export function playingControlPlacement(
  glyph: PlayingControlGlyph,
  size: number,
) {
  const bounds = PlayingControlGeometry.glyphs[glyph];
  const scale = size / Math.max(bounds.width, bounds.height);
  return {
    canvasSize: PlayingControlGeometry.canvasSize * scale,
    left:
      (size - bounds.width * scale) / PlayingControlGeometry.centerDivision -
      bounds.left * scale,
    top:
      (size - bounds.height * scale) / PlayingControlGeometry.centerDivision -
      bounds.top * scale,
  };
}
