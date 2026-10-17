const { test } = require('node:test');
const assertion = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');
const { imageHeaderDimensions } = require('../.build/assets/ImageHeaderDimensions');
for (const format of ['png','jpg','webp','gif']) {
  test(`header dimensions match real decoded ${format} images`, () => {
    const directory = mkdtempSync(join(tmpdir(), 'streaming-image-header-'));
    try {
      const path = join(directory, 'image.' + format);
      const argumentsList = ['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=red:s=320x240','-frames:v','1','-threads','1',path];
      const result = spawnSync('ffmpeg', argumentsList, { encoding:'utf8' }); assertion.equal(result.status,0,result.stderr);
      assertion.deepEqual(imageHeaderDimensions(readFileSync(path).toString('base64')), { width:320,height:240 });
    } finally { rmSync(directory,{recursive:true,force:true}); }
  });
}
test('lossless WebP dimensions are read before decoding pixel data', () => {
  const header=Buffer.alloc(25);header.write('RIFF');header.write('WEBP',8);header.write('VP8L',12);header.writeUInt32LE(5,16);header[20]=0x2f;
  header.writeUInt32LE((319)|(239<<14),21);
  assertion.deepEqual(imageHeaderDimensions(header.toString('base64')),{width:320,height:240});
});
test('extended WebP canvas dimensions use their full 24-bit bounds', () => {
  const header=Buffer.alloc(30);header.write('RIFF');header.write('WEBP',8);header.write('VP8X',12);header.writeUInt32LE(10,16);
  header.writeUIntLE(99999,24,3);header.writeUIntLE(99999,27,3);
  assertion.deepEqual(imageHeaderDimensions(header.toString('base64')),{width:100000,height:100000});
});
test('truncated or unrecognized image headers fail closed', () => {
  for(const header of [Buffer.from('not an image'),Buffer.from([0xff,0xd8,0xff,0xe1,0,0]),Buffer.from('RIFF')]) {
    assertion.throws(()=>imageHeaderDimensions(header.toString('base64')));
  }
});
