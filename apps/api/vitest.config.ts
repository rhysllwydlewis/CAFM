import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC keeps the decorator metadata Nest's dependency injection needs.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: { include: ['test/**/*.test.ts'], testTimeout: 30000, fileParallelism: false },
});
