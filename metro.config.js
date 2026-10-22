const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { resolve } = require('node:path');

const PlayerProjectDirectory = resolve(__dirname, '../StreamingServicePlayer');
const SpotifyProjectRelativeDirectory = '../StreamingServiceSpotifyJam';
const SpotifyProjectDirectory = resolve(__dirname, SpotifyProjectRelativeDirectory);
const ApplicationDependenciesDirectory = resolve(__dirname, 'node_modules');
const ReactPackageName = 'react';
const ReactNativePackageName = 'react-native';
const configuration = {
  watchFolders: [PlayerProjectDirectory, SpotifyProjectDirectory],
  resolver: {
    nodeModulesPaths: [ApplicationDependenciesDirectory],
    extraNodeModules: {
      [ReactPackageName]: resolve(ApplicationDependenciesDirectory, ReactPackageName),
      [ReactNativePackageName]: resolve(ApplicationDependenciesDirectory, ReactNativePackageName),
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), configuration);
