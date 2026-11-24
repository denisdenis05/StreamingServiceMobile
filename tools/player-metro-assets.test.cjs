const { test } = require('node:test');
const assertion = require('node:assert/strict');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { getAssetData } = require('metro/src/Assets');
const Fixture = Object.freeze({ prefix: 'streaming-metro-assets-', filename: 'fixture.png', publicPath: '/assets',
  encoding: 'base64', image: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1kAAAAASUVORK5CYII=',
  width: 1, height: 1, platform: 'android' });
const TestName = 'Metro loads PNG asset files as bytes for the image-size binary API';
test(TestName, async () => {
  const directory = mkdtempSync(join(tmpdir(), Fixture.prefix));
  try {
    const filename = join(directory, Fixture.filename); writeFileSync(filename, Buffer.from(Fixture.image, Fixture.encoding));
    const data = await getAssetData(filename, Fixture.filename, [], Fixture.platform, Fixture.publicPath);
    assertion.equal(data.width, Fixture.width); assertion.equal(data.height, Fixture.height);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
