import {
  playingControlPlacement,
  PlayingControlGeometry,
  PlayingControlGlyph,
} from '../src/pages/Playing/PlayingControlGeometry';
const GeometryFixture = Object.freeze({
  glyphSize: 28,
  center: 14,
  precision: 4,
  noOffset: 0,
});
test.each(Object.keys(PlayingControlGeometry.glyphs) as PlayingControlGlyph[])(
  '%s removes SVG whitespace and centers the painted glyph at the shared size',
  glyph => {
    const bounds = PlayingControlGeometry.glyphs[glyph];
    const placement = playingControlPlacement(glyph, GeometryFixture.glyphSize);
    const scale = placement.canvasSize / PlayingControlGeometry.canvasSize;
    const left = placement.left + bounds.left * scale;
    const top = placement.top + bounds.top * scale;
    const width = bounds.width * scale;
    const height = bounds.height * scale;
    expect(Math.max(width, height)).toBeCloseTo(
      GeometryFixture.glyphSize,
      GeometryFixture.precision,
    );
    expect(left + width / PlayingControlGeometry.centerDivision).toBeCloseTo(
      GeometryFixture.center,
      GeometryFixture.precision,
    );
    expect(top + height / PlayingControlGeometry.centerDivision).toBeCloseTo(
      GeometryFixture.center,
      GeometryFixture.precision,
    );
  },
);
