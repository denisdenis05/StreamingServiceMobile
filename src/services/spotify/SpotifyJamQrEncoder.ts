import type { SpotifyJamQrMatrix } from './SpotifyJamQr';

declare const require: (moduleName: string) => typeof import('qrcode-generator');
const createQrCode = require('qrcode-generator');

const Encoding = Object.freeze({ automaticVersion: 0, errorCorrection: 'M', byteMode: 'Byte' } as const);

export function encodeSpotifyJamQr(address: string): SpotifyJamQrMatrix {
  const code = createQrCode(Encoding.automaticVersion, Encoding.errorCorrection);
  code.addData(address, Encoding.byteMode);
  code.make();
  return { moduleCount: code.getModuleCount(), isDark: (row, column) => code.isDark(row, column) };
}
