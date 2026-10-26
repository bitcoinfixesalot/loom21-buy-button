import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __VERSION__: '"test"' },
  test: {
    include: ['test/unit/**/*.test.ts'],
    environment: 'node',
  },
});
