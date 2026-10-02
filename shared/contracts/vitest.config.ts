import { defineConfig } from 'vitest/config'

// shared/contracts tests run in node (pure zod schema validation, no DOM).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
