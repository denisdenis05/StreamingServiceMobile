const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { resolve } = require('node:path');

const PlayerProjectDirectory = resolve(__dirname, '../StreamingServicePlayer');
const SpotifyProjectRelativeDirectory = '../StreamingServiceSpotifyJam';
const SpotifyProjectDirectory = resolve(__dirname, SpotifyProjectRelativeDirectory);
const ApplicationDependenciesDirectory = resolve(__dirname, 'node_modules');
const ReactPackageName = 'react';
const ReactNativePackageName = 'react-native';
const DefaultConfiguration = getDefaultConfig(__dirname);
const NativeBuildDirectory = resolve(__dirname, 'native/librespot-session/target');
const NativeBuildDirectoryExpression = new RegExp(
  `^${NativeBuildDirectory.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[/\\\\].*)?$`,
);
const DefaultBlockList = DefaultConfiguration.resolver.blockList;
const DefaultBlockListExpressions = Array.isArray(DefaultBlockList)
  ? DefaultBlockList
  : [DefaultBlockList];
const configuration = {
  watchFolders: [PlayerProjectDirectory, SpotifyProjectDirectory],
  resolver: {
    blockList: [...DefaultBlockListExpressions, NativeBuildDirectoryExpression],
    nodeModulesPaths: [ApplicationDependenciesDirectory],
    extraNodeModules: {
      [ReactPackageName]: resolve(ApplicationDependenciesDirectory, ReactPackageName),
      [ReactNativePackageName]: resolve(ApplicationDependenciesDirectory, ReactNativePackageName),
    },
  },
};

module.exports = mergeConfig(DefaultConfiguration, configuration);
