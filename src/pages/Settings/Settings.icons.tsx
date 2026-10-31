import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '../../constants/styling';
export enum SettingsSymbol {
  Back = 'back',
  Forward = 'forward',
  Account = 'account',
  Settings = 'settings',
  Library = 'library',
  Create = 'create',
  LastFm = 'lastfm',
  Spotify = 'spotify',
  Playback = 'playback',
  Storage = 'storage',
  About = 'about',
  Logout = 'logout',
}
const IconPresentation = Object.freeze({
  size: 22,
  viewBox: '0 0 24 24',
  strokeWidth: 1.7,
  noFill: 'none',
  rounded: 'round' as const,
  center: 12,
  accountY: 8,
  accountRadius: 4,
  informationRadius: 9,
  spotifyRadius: 10,
  gearRadius: 3,
});
const paths: Readonly<Record<SettingsSymbol, string>> = Object.freeze({
  [SettingsSymbol.Back]: 'm14 5-7 7 7 7M7 12h14',
  [SettingsSymbol.Forward]: 'm9 5 7 7-7 7',
  [SettingsSymbol.Account]: 'M4 21v-2a8 8 0 0 1 16 0v2',
  [SettingsSymbol.Settings]:
    'm9 3-1 3-3 1v3l-2 2 2 2v3l3 1 1 3h6l1-3 3-1v-3l2-2-2-2V7l-3-1-1-3Z',
  [SettingsSymbol.Library]: 'M4 4v16M9 4v16m5-15 5 14M3 20h18',
  [SettingsSymbol.Create]: 'M12 4v16M4 12h16',
  [SettingsSymbol.LastFm]:
    'M10 8c-5-4-9 0-7 5 1 3 5 4 8 2m-2-7 5 8c2 3 8 1 7-2-1-3-7-1-7-5 0-3 5-4 7-1',
  [SettingsSymbol.Spotify]:
    'M6 9c4-2 8-1 12 1M7 12c3-1 7-1 10 1m-9 2c3-1 5 0 8 1',
  [SettingsSymbol.Playback]: 'M4 7h16M4 17h16M9 4v6m6 4v6',
  [SettingsSymbol.Storage]: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  [SettingsSymbol.About]: 'M12 11v6m0-10v.1',
  [SettingsSymbol.Logout]: 'M9 4H4v16h5m5-12 4 4-4 4m-6-4h12',
});
export function SettingsIcon({
  symbol,
  color = colors.accentPrimary,
}: {
  symbol: SettingsSymbol;
  color?: string;
}) {
  return (
    <Svg
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      width={IconPresentation.size}
      height={IconPresentation.size}
      viewBox={IconPresentation.viewBox}
      fill={IconPresentation.noFill}
      stroke={color}
      strokeWidth={IconPresentation.strokeWidth}
      strokeLinecap={IconPresentation.rounded}
      strokeLinejoin={IconPresentation.rounded}
    >
      <Path d={paths[symbol]} />
      {symbol === SettingsSymbol.Account && (
        <Circle
          cx={IconPresentation.center}
          cy={IconPresentation.accountY}
          r={IconPresentation.accountRadius}
        />
      )}
      {symbol === SettingsSymbol.Settings && (
        <Circle
          cx={IconPresentation.center}
          cy={IconPresentation.center}
          r={IconPresentation.gearRadius}
        />
      )}
      {symbol === SettingsSymbol.About && (
        <Circle
          cx={IconPresentation.center}
          cy={IconPresentation.center}
          r={IconPresentation.informationRadius}
        />
      )}
      {symbol === SettingsSymbol.Spotify && (
        <Circle
          cx={IconPresentation.center}
          cy={IconPresentation.center}
          r={IconPresentation.spotifyRadius}
        />
      )}
    </Svg>
  );
}
