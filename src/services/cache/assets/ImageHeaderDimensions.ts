const ImageHeaderPolicy = Object.freeze({ alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',
  padding: '=', characterBits: 6, byteBits: 8, byteMask: 255, initialCount: 0, increment: 1,
  wordBytes: 2, integerBytes: 4, unsignedShift: 0, shiftWord: 16, shiftHighByte: 24,
  jpegPrefix: 0xff, jpegStart: 0xd8, jpegEnd: 0xd9, jpegScan: 0xda, jpegTemporary: 0x01,
  jpegRestartFirst: 0xd0, jpegRestartLast: 0xd7, jpegFirstSegment: 2,
  jpegFrameMarkers: Object.freeze([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]),
  jpegMinimumFrameBytes: 7, jpegHeightOffset: 3, jpegWidthOffset: 5,
  pngSignature: Object.freeze([137, 80, 78, 71, 13, 10, 26, 10]), pngDimensionsEnd: 24,
  pngHeaderOffset: 12, pngHeaderName: 'IHDR', pngWidthOffset: 16, pngHeightOffset: 20,
  gifPrefix: 'GIF8', gifDimensionsEnd: 10, gifWidthOffset: 6, gifHeightOffset: 8,
  riffPrefix: 'RIFF', riffKind: 'WEBP', riffKindOffset: 8, firstChunk: 12, chunkHeaderBytes: 8,
  chunkLengthOffset: 4, evenAlignment: 2, extendedKind: 'VP8X', losslessKind: 'VP8L', lossyKind: 'VP8 ',
  extendedMinimumBytes: 10, extendedWidthOffset: 4, extendedHeightOffset: 7, tripleBytes: 3,
  losslessMinimumBytes: 5, losslessSignature: 0x2f, losslessWordOffset: 1, losslessDimensionMask: 0x3fff,
  losslessHeightShift: 14, lossyMinimumBytes: 10, lossyWidthOffset: 6, lossyHeightOffset: 8,
  lossySignatureOffset: 3, lossySignature: Object.freeze([0x9d, 0x01, 0x2a]),
  failureMessage: 'The image header is invalid or its metadata is too large.' });
export interface ImageHeaderDimensions { readonly width: number; readonly height: number }
function requireBytes(bytes: Uint8Array, offset: number, count: number): void {
  if (offset < ImageHeaderPolicy.initialCount || offset + count > bytes.length) throw new Error(ImageHeaderPolicy.failureMessage);
}
function numberAt(bytes: Uint8Array, offset: number, count: number, littleEndian: boolean): number {
  requireBytes(bytes, offset, count); let value: number = ImageHeaderPolicy.initialCount;
  for (let index = ImageHeaderPolicy.initialCount; index < count; index += ImageHeaderPolicy.increment) {
    const location = littleEndian ? offset + count - index - ImageHeaderPolicy.increment : offset + index;
    value = value * (ImageHeaderPolicy.byteMask + ImageHeaderPolicy.increment) + bytes[location]!;
  }
  return value;
}
function label(bytes: Uint8Array, offset: number): string {
  requireBytes(bytes, offset, ImageHeaderPolicy.integerBytes);
  return String.fromCharCode(...bytes.slice(offset, offset + ImageHeaderPolicy.integerBytes));
}
function matches(bytes: Uint8Array, offset: number, signature: readonly number[]): boolean {
  return offset + signature.length <= bytes.length && signature.every((value, index) => bytes[offset + index] === value);
}
function decode(encoded: string): Uint8Array {
  const bytes: number[] = []; let buffer: number = ImageHeaderPolicy.initialCount; let available: number = ImageHeaderPolicy.initialCount;
  for (const character of encoded) {
    if (character === ImageHeaderPolicy.padding) break;
    const value = ImageHeaderPolicy.alphabet.indexOf(character);
    if (value < ImageHeaderPolicy.initialCount) throw new Error(ImageHeaderPolicy.failureMessage);
    buffer = (buffer << ImageHeaderPolicy.characterBits) | value; available += ImageHeaderPolicy.characterBits;
    if (available >= ImageHeaderPolicy.byteBits) {
      available -= ImageHeaderPolicy.byteBits;
      bytes.push((buffer >>> available) & ImageHeaderPolicy.byteMask);
    }
  }
  return new Uint8Array(bytes);
}
function jpeg(bytes: Uint8Array): ImageHeaderDimensions {
  let offset: number = ImageHeaderPolicy.jpegFirstSegment;
  while (offset < bytes.length) {
    if (bytes[offset] !== ImageHeaderPolicy.jpegPrefix) break;
    while (bytes[offset] === ImageHeaderPolicy.jpegPrefix) offset += ImageHeaderPolicy.increment;
    requireBytes(bytes, offset, ImageHeaderPolicy.increment); const marker = bytes[offset]!; offset += ImageHeaderPolicy.increment;
    if (marker === ImageHeaderPolicy.jpegEnd || marker === ImageHeaderPolicy.jpegScan) break;
    if (marker === ImageHeaderPolicy.jpegStart || marker === ImageHeaderPolicy.jpegTemporary
      || (marker >= ImageHeaderPolicy.jpegRestartFirst && marker <= ImageHeaderPolicy.jpegRestartLast)) continue;
    const length = numberAt(bytes, offset, ImageHeaderPolicy.wordBytes, false);
    if (length < ImageHeaderPolicy.wordBytes) break;
    if (ImageHeaderPolicy.jpegFrameMarkers.includes(marker)) {
      requireBytes(bytes, offset, ImageHeaderPolicy.jpegMinimumFrameBytes);
      return { width: numberAt(bytes, offset + ImageHeaderPolicy.jpegWidthOffset, ImageHeaderPolicy.wordBytes, false),
        height: numberAt(bytes, offset + ImageHeaderPolicy.jpegHeightOffset, ImageHeaderPolicy.wordBytes, false) };
    }
    offset += length;
  }
  throw new Error(ImageHeaderPolicy.failureMessage);
}
function webp(bytes: Uint8Array): ImageHeaderDimensions {
  let offset: number = ImageHeaderPolicy.firstChunk;
  while (offset + ImageHeaderPolicy.chunkHeaderBytes <= bytes.length) {
    const kind = label(bytes, offset); const length = numberAt(bytes, offset + ImageHeaderPolicy.chunkLengthOffset, ImageHeaderPolicy.integerBytes, true);
    const content = offset + ImageHeaderPolicy.chunkHeaderBytes;
    if (kind === ImageHeaderPolicy.extendedKind) {
      requireBytes(bytes, content, ImageHeaderPolicy.extendedMinimumBytes);
      return { width: ImageHeaderPolicy.increment + numberAt(bytes, content + ImageHeaderPolicy.extendedWidthOffset, ImageHeaderPolicy.tripleBytes, true),
        height: ImageHeaderPolicy.increment + numberAt(bytes, content + ImageHeaderPolicy.extendedHeightOffset, ImageHeaderPolicy.tripleBytes, true) };
    }
    if (kind === ImageHeaderPolicy.losslessKind) {
      requireBytes(bytes, content, ImageHeaderPolicy.losslessMinimumBytes);
      if (bytes[content] !== ImageHeaderPolicy.losslessSignature) break;
      const dimensions = numberAt(bytes, content + ImageHeaderPolicy.losslessWordOffset, ImageHeaderPolicy.integerBytes, true);
      return { width: ImageHeaderPolicy.increment + (dimensions & ImageHeaderPolicy.losslessDimensionMask),
        height: ImageHeaderPolicy.increment + ((dimensions >>> ImageHeaderPolicy.losslessHeightShift) & ImageHeaderPolicy.losslessDimensionMask) };
    }
    if (kind === ImageHeaderPolicy.lossyKind) {
      requireBytes(bytes, content, ImageHeaderPolicy.lossyMinimumBytes);
      if (!matches(bytes, content + ImageHeaderPolicy.lossySignatureOffset, ImageHeaderPolicy.lossySignature)) break;
      return { width: numberAt(bytes, content + ImageHeaderPolicy.lossyWidthOffset, ImageHeaderPolicy.wordBytes, true) & ImageHeaderPolicy.losslessDimensionMask,
        height: numberAt(bytes, content + ImageHeaderPolicy.lossyHeightOffset, ImageHeaderPolicy.wordBytes, true) & ImageHeaderPolicy.losslessDimensionMask };
    }
    offset = content + length + (length % ImageHeaderPolicy.evenAlignment);
  }
  throw new Error(ImageHeaderPolicy.failureMessage);
}
export function imageHeaderDimensions(encoded: string): ImageHeaderDimensions {
  const bytes = decode(encoded); requireBytes(bytes, ImageHeaderPolicy.initialCount, ImageHeaderPolicy.integerBytes);
  if (matches(bytes, ImageHeaderPolicy.initialCount, ImageHeaderPolicy.pngSignature)) {
    requireBytes(bytes, ImageHeaderPolicy.initialCount, ImageHeaderPolicy.pngDimensionsEnd);
    if (label(bytes, ImageHeaderPolicy.pngHeaderOffset) !== ImageHeaderPolicy.pngHeaderName) throw new Error(ImageHeaderPolicy.failureMessage);
    return { width: numberAt(bytes, ImageHeaderPolicy.pngWidthOffset, ImageHeaderPolicy.integerBytes, false),
      height: numberAt(bytes, ImageHeaderPolicy.pngHeightOffset, ImageHeaderPolicy.integerBytes, false) };
  }
  if (bytes[ImageHeaderPolicy.initialCount] === ImageHeaderPolicy.jpegPrefix && bytes[ImageHeaderPolicy.increment] === ImageHeaderPolicy.jpegStart) return jpeg(bytes);
  if (label(bytes, ImageHeaderPolicy.initialCount) === ImageHeaderPolicy.gifPrefix) {
    requireBytes(bytes, ImageHeaderPolicy.initialCount, ImageHeaderPolicy.gifDimensionsEnd);
    return { width: numberAt(bytes, ImageHeaderPolicy.gifWidthOffset, ImageHeaderPolicy.wordBytes, true),
      height: numberAt(bytes, ImageHeaderPolicy.gifHeightOffset, ImageHeaderPolicy.wordBytes, true) };
  }
  if (label(bytes, ImageHeaderPolicy.initialCount) === ImageHeaderPolicy.riffPrefix && label(bytes, ImageHeaderPolicy.riffKindOffset) === ImageHeaderPolicy.riffKind) return webp(bytes);
  throw new Error(ImageHeaderPolicy.failureMessage);
}
