import { describe, it, expect } from 'vitest'
import {
  INDEXABLE_ROUTES,
  absoluteUrl,
  buildRobotsTxt,
  buildSitemapXml,
  isLocalhostOrigin,
  normalizeOrigin,
} from '@/lib/site-urls'

const PROD_ORIGIN = 'https://drcip.example.org'
const AUTH_ROUTES = ['/login', '/dashboard', '/incidents', '/admin', '/rag', '/field', '/resources']

describe('site-urls', () => {
  it('normalises origins and detects localhost', () => {
    expect(normalizeOrigin(`${PROD_ORIGIN}/`)).toBe(PROD_ORIGIN)
    expect(absoluteUrl(PROD_ORIGIN, '/')).toBe(`${PROD_ORIGIN}/`)
    expect(absoluteUrl(PROD_ORIGIN, '/privacy')).toBe(`${PROD_ORIGIN}/privacy`)
    expect(isLocalhostOrigin('http://localhost:5173')).toBe(true)
    expect(isLocalhostOrigin('http://127.0.0.1:5173')).toBe(true)
    expect(isLocalhostOrigin(PROD_ORIGIN)).toBe(false)
  })

  it('robots.txt references the configured sitemap and no localhost', () => {
    const robots = buildRobotsTxt(PROD_ORIGIN)
    expect(robots).toContain(`Sitemap: ${PROD_ORIGIN}/sitemap.xml`)
    expect(robots).not.toMatch(/localhost/i)
    expect(robots).toMatch(/^User-agent: \*\nAllow: \/\n/)
  })

  it('sitemap.xml uses the configured origin for every required route', () => {
    const xml = buildSitemapXml(PROD_ORIGIN)
    expect(xml).toContain(`<loc>${PROD_ORIGIN}/</loc>`)
    expect(xml).toContain(`<loc>${PROD_ORIGIN}/privacy</loc>`)
    expect(xml).toContain(`<loc>${PROD_ORIGIN}/terms</loc>`)
    expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/)
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
  })

  it('lists only indexable public routes and never authenticated routes', () => {
    expect([...INDEXABLE_ROUTES]).toEqual(['/', '/privacy', '/terms'])
    const xml = buildSitemapXml(PROD_ORIGIN)
    for (const route of AUTH_ROUTES) {
      expect(xml).not.toContain(`${PROD_ORIGIN}${route}`)
    }
  })

  it('never emits a localhost URL for a production origin', () => {
    expect(buildSitemapXml(PROD_ORIGIN)).not.toMatch(/localhost/i)
    expect(buildRobotsTxt(PROD_ORIGIN)).not.toMatch(/localhost/i)
  })
})
