import { execSync } from 'node:child_process'
import path from 'node:path'
import { createRequire } from 'node:module'
import type { ExecSyncOptions } from 'node:child_process'
import pg from 'pg'

const require = createRequire(import.meta.url)

export default async function setup() {
  const testUrl = process.env.DATABASE_URL_TEST || 'postgresql://postgres:postgres@localhost:5432/drcip_test?schema=public'
  const maintenanceUrl = 'postgresql://postgres:postgres@localhost:5432/postgres'

  // Drop and recreate the test database via pg (raw connection, no Prisma transaction wrapping)
  const client = new pg.Client({ connectionString: maintenanceUrl })
  await client.connect()
  try {
    await client.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'drcip_test' AND pid <> pg_backend_pid()`)
    await client.query('DROP DATABASE IF EXISTS "drcip_test"')
    await client.query('CREATE DATABASE "drcip_test"')
  } finally {
    await client.end()
  }

  // Enable PostGIS on the fresh test database
  const testClient = new pg.Client({ connectionString: testUrl })
  await testClient.connect()
  try {
    await testClient.query('CREATE EXTENSION IF NOT EXISTS postgis')
  } finally {
    await testClient.end()
  }

  // Apply Prisma migrations against the test database
  const prismaCli = require.resolve('prisma')
  const cwd = path.resolve(__dirname, '..')
  const options: ExecSyncOptions = {
    cwd,
    env: { ...process.env, DATABASE_URL: testUrl },
  }
  execSync(`node "${prismaCli}" migrate deploy`, options)
}