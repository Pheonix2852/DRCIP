import { defineConfig } from 'vitest/config'
import path from 'node:path'

const testUrl = process.env.DATABASE_URL_TEST || 'postgresql://postgres:postgres@localhost:5432/drcip_test?schema=public'

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: './tests/global-setup.ts',
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 120000,
    env: {
      DATABASE_URL: testUrl,
      JWT_SECRET: 'test-jwt-secret-key',
      JWT_EXPIRES_IN: '3600',
      NODE_ENV: 'test',
    },
  },
  resolve: {
    alias: {
      '@drcip/contracts': path.resolve(__dirname, '../shared/contracts/src/index.ts'),
    },
  },
})