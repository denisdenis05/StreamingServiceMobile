const { test } = require('node:test');
const assertion = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const PatchPolicy = Object.freeze({
  filename: '../patches/metro+0.82.5.patch',
  encoding: 'utf8',
  newline: '\n',
  hunkHeader: /^@@ -(\d+),(\d+) \+(\d+),(\d+) @@/,
  addedPrefix: '+',
  removedPrefix: '-',
  contextPrefix: ' ',
  firstIndex: 0,
  oldLengthCaptureIndex: 2,
  newLengthCaptureIndex: 4,
  emptyLength: 0,
  countIncrement: 1,
  expectedHunkCount: 4,
});
const TestNames = Object.freeze({
  lengths: 'the Metro patch declares the actual old and new lengths of every hunk',
  exports: 'the Metro patch updates both JavaScript and Flow image-size imports',
});
const patch = readFileSync(resolve(__dirname, PatchPolicy.filename), PatchPolicy.encoding);

test(TestNames.lengths, () => {
  let currentHunk = null;
  const hunks = [];
  for (const line of patch.split(PatchPolicy.newline)) {
    const match = line.match(PatchPolicy.hunkHeader);
    if (match !== null) {
      currentHunk = { expectedOld: Number(match[PatchPolicy.oldLengthCaptureIndex]),
        expectedNew: Number(match[PatchPolicy.newLengthCaptureIndex]),
        actualOld: PatchPolicy.emptyLength, actualNew: PatchPolicy.emptyLength };
      hunks.push(currentHunk);
      continue;
    }
    if (currentHunk === null) continue;
    const prefix = line[PatchPolicy.firstIndex];
    if (prefix === PatchPolicy.contextPrefix || prefix === PatchPolicy.removedPrefix) currentHunk.actualOld += PatchPolicy.countIncrement;
    if (prefix === PatchPolicy.contextPrefix || prefix === PatchPolicy.addedPrefix) currentHunk.actualNew += PatchPolicy.countIncrement;
    if (prefix !== PatchPolicy.contextPrefix && prefix !== PatchPolicy.removedPrefix && prefix !== PatchPolicy.addedPrefix) currentHunk = null;
  }
  assertion.equal(hunks.length, PatchPolicy.expectedHunkCount);
  for (const hunk of hunks) {
    assertion.equal(hunk.actualOld, hunk.expectedOld);
    assertion.equal(hunk.actualNew, hunk.expectedNew);
  }
});
test(TestNames.exports, () => {
  const namedImportPatterns = Object.freeze([
    /\+const \{ imageSize: getImageSize \} = require\("image-size"\);/,
    /\+const \{imageSize: getImageSize\} = require\('image-size'\);/,
  ]);
  for (const pattern of namedImportPatterns) assertion.match(patch, pattern);
});
