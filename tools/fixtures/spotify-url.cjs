const Imports = Object.freeze({ assertion: 'node:assert/strict', babel: '@babel/core', transform: '@babel/plugin-transform-modules-commonjs',
  polyfill: 'react-native-url-polyfill', implementation: 'react-native-url-polyfill/js/URL.js', native: 'react-native' });
const Parameters = Object.freeze({ require: 'require', module: 'module', exports: 'exports' });
const assertion = require(Imports.assertion);
const babel = require(Imports.babel);
const compiled = babel.transformFileSync(require.resolve(Imports.implementation), { babelrc: false, configFile: false, plugins: [Imports.transform] });
const implementation = { exports: {} };
const evaluate = new Function(Parameters.require, Parameters.module, Parameters.exports, compiled.code);
evaluate(name => { assertion.equal(name, Imports.native); return { NativeModules: {} }; }, implementation, implementation.exports);
require.cache[require.resolve(Imports.polyfill)] = { exports: implementation.exports };
module.exports = implementation.exports;
