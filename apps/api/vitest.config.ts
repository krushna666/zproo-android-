import { defineConfig } from 'vitest/config';
import { TEST_DATABASE_URL as databaseUrl, TEST_REDIS_URL as redisUrl } from './test/testUrls';

// Integration tests run against a dedicated PostgreSQL database (created and migrated by
// test/globalSetup.ts) and Redis. Override with TEST_DATABASE_URL / TEST_REDIS_URL.

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    globalSetup: ['test/globalSetup.ts'],
    // Test files share one database; run them one at a time.
    fileParallelism: false,
    testTimeout: 15_000,
    // `npm run test:coverage -w @zproo/api` (Prompt 04 §7: services, providers, middleware).
    coverage: {
      provider: 'v8',
      include: ['src/services/**', 'src/providers/**', 'src/middleware/**'],
      reporter: ['text-summary', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
    },
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl,
      DIRECT_DATABASE_URL: databaseUrl,
      REDIS_URL: redisUrl,
      LOG_LEVEL: 'silent',
    },
  },
});
