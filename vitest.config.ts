import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/golden/**/*.test.ts', 'tests/forms/**/*.test.ts'],
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
      },
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        // Re-export index files that don't need coverage
        'src/diff/index.ts',
        'src/parser/index.ts',
        'src/serializer/index.ts',
        'src/validator/index.ts',
        // Build scripts - not runtime code
        'src/scripts/**',
      ],
    },
  },
});
