export const TokenIdentityPolicy = Object.freeze({
  segmentSeparator: '.',
  segmentCount: 3,
  payloadSegmentIndex: 1,
  maximumPayloadCharacters: 65536,
  minimumSubjectLength: 1,
  base64Alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',
  permittedPayload: /^[A-Za-z0-9_-]+$/,
  bitsPerCharacter: 6,
  bitsPerByte: 8,
  byteMask: 255,
  initialBuffer: 0,
  hexadecimalRadix: 16,
  hexadecimalByteWidth: 2,
  hexadecimalPadding: '0',
  percentPrefix: '%',
  emptySeparator: '',
  subjectClaim: 'sub',
  stringType: 'string',
  invalidTokenMessage: 'The playback account identity is unavailable.',
});

export class PlaybackAccountIdentity {
  identify(accessToken: string): string {
    try {
      const segments = accessToken.split(TokenIdentityPolicy.segmentSeparator);
      const payload = segments[TokenIdentityPolicy.payloadSegmentIndex];
      if (segments.length !== TokenIdentityPolicy.segmentCount || payload === undefined
        || payload.length > TokenIdentityPolicy.maximumPayloadCharacters
        || !TokenIdentityPolicy.permittedPayload.test(payload)) throw new Error();
      const bytes: number[] = [];
      let buffer: number = TokenIdentityPolicy.initialBuffer;
      let availableBits: number = TokenIdentityPolicy.initialBuffer;
      for (const character of payload) {
        buffer = (buffer << TokenIdentityPolicy.bitsPerCharacter) | TokenIdentityPolicy.base64Alphabet.indexOf(character);
        availableBits += TokenIdentityPolicy.bitsPerCharacter;
        if (availableBits >= TokenIdentityPolicy.bitsPerByte) {
          availableBits -= TokenIdentityPolicy.bitsPerByte;
          bytes.push((buffer >> availableBits) & TokenIdentityPolicy.byteMask);
        }
      }
      const text = decodeURIComponent(bytes.map(byte => TokenIdentityPolicy.percentPrefix
        + byte.toString(TokenIdentityPolicy.hexadecimalRadix).padStart(TokenIdentityPolicy.hexadecimalByteWidth,
          TokenIdentityPolicy.hexadecimalPadding)).join(TokenIdentityPolicy.emptySeparator));
      const subject: unknown = (JSON.parse(text) as Record<string, unknown>)[TokenIdentityPolicy.subjectClaim];
      if (typeof subject !== TokenIdentityPolicy.stringType
        || (subject as string).trim().length < TokenIdentityPolicy.minimumSubjectLength) throw new Error();
      return subject as string;
    } catch { throw new Error(TokenIdentityPolicy.invalidTokenMessage); }
  }
}
