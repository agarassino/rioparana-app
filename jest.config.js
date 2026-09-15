// React Native component tests.
//
// This repo runs two test runners on purpose. vitest covers the pure logic —
// services, geometry, string building — and starts in milliseconds. It cannot
// cover components: React Native is published as Flow-typed source and esbuild
// has no Flow parser, so importing react-native under vitest dies at
// `Unexpected token 'typeof'`. jest-expo carries the same babel transform Metro
// uses, so it is the only runner that can actually render these.
//
// Split by extension: *.test.ts is vitest, *.test.tsx is jest.
module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/test/**/*.test.tsx'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)',
  ],
};
