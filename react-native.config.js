module.exports = {
  assets: ['./assets/fonts'],
  dependencies: {
    'react-native-config': {
      platforms: {
        android: null,
        /*
        NEEDS MANUAL ADD IN android/settings.gradle
         include ':react-native-config'
         project(':react-native-config').projectDir = new File(rootProject.projectDir, '../node_modules/react-native-config/android')

        NEEDS MANUAL ADD IN android/app/build.gradle
         implementation project(':react-native-config')
         * */
      },
    },
  },
};
