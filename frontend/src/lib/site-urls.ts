/**
 * Build-time generation of `robots.txt` and `sitemap.xml`.
 *
 * These files live in `public/` as static assets in most Vite projects, which
 * means they are copied verbatim and cannot receive the configured
 * `VITE_SITE_ORIGIN`. Instead they are generated here (see the
 * `drcip-seo-files` plugin in `vite.config.ts`) from a single source of truth
 * so that local development and production builds never emit stale/hardcoded
 * origins.
 *
 * Keep these functions pure (no Node/browser APIs) so they can be used by the
 * Vite config, the dev-server middleware and the unit tests alike.
 */

/** Public, indexable routes. Authenticated/application routes are excluded. */
export const INDEXABLE_ROUTES = ['/', '/privacy', '/terms'] as const

const LOCAL_HOSTS = /^(https?:\/\/)(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i

/** Normalise an origin by trimming whitespace and a single-or-more trailing slash. */
export function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '')
}

/** True when the origin points at the local machine (dev only). */
export function isLocalhostOrigin(origin: string): boolean {
  return LOCAL_HOSTS.test(origin.trim())
}

/** Absolute URL for a route, joining the origin and path without a double slash. */
export function absoluteUrl(origin: string, route: string): string {
  const base = normalizeOrigin(origin)
  const path = route === '/' ? '/' : `/${route.replace(/^\/+/, '')}`
  return `${base}${path}`
}

export function buildRobotsTxt(siteOrigin: string): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${absoluteUrl(siteOrigin, '/sitemap.xml')}\n`
}

export function buildSitemapXml(
  siteOrigin: string,
  routes: readonly string[] = INDEXABLE_ROUTES,
): string {
  const urls = routes.map((route) => `  <url>\n    <loc>${absoluteUrl(siteOrigin, route)}</loc>\n  </url>`)
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n')
}
