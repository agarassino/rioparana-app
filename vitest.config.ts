import { defineConfig } from 'vitest/config';

// Pure logic only. React Native components are tested by jest-expo instead:
// RN ships Flow-typed source, which esbuild cannot parse, so vitest cannot
// load the native module graph at all. See jest.config.js.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
