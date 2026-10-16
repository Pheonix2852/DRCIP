import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, pathToFileURL } from 'url'
import path from 'path'
import { buildRobotsTxt, buildSitemapXml, isLocalhostOrigin, normalizeOrigin } from './src/lib/site-urls'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Used only when serving locally with no configured origin. */
const DEV_ORIGIN_FALLBACK = 'http://localhost:5173'

/**
 * Resolve the public site origin for the current command.
 * - `serve` (dev): falls back to localhost so local development needs no
 *   production domain.
 * - `build` (production): requires an explicitly configured, non-localhost
 *   origin so a production build can never emit localhost URLs.
 */
function resolveSiteOrigin(command: string, configured: string | undefined): string {
  const origin = (configured ?? '').trim()

  if (command === 'build') {
    if (!origin) {
      throw new Error(
        '[drcip-seo-files] VITE_SITE_ORIGIN is required for production builds, ' +
          'e.g. VITE_SITE_ORIGIN=https://drcip.example.org npm run build',
      )
    }
    if (isLocalhostOrigin(origin)) {
      throw new Error(
        `[drcip-seo-files] Refusing to build with a localhost VITE_SITE_ORIGIN (${origin}). ` +
          'Set the real public site origin.',
      )
    }
  }

  return normalizeOrigin(origin || DEV_ORIGIN_FALLBACK)
}

/**
 * Generates `robots.txt` and `sitemap.xml` from the configured `VITE_SITE_ORIGIN`.
 * Dev server: served on the fly. Build: emitted into the output directory
 * (replacing the former hardcoded files in `public/`).
 */
function seoFilesPlugin(siteOrigin: string): Plugin {
  return {
    name: 'drcip-seo-files',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0]
        if (url !== '/robots.txt' && url !== '/sitemap.xml') return next()
        const isRobots = url === '/robots.txt'
        res.setHeader(
          'Content-Type',
          isRobots ? 'text/plain; charset=utf-8' : 'application/xml; charset=utf-8',
        )
        res.end(isRobots ? buildRobotsTxt(siteOrigin) : buildSitemapXml(siteOrigin))
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: buildRobotsTxt(siteOrigin) })
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: buildSitemapXml(siteOrigin) })
    },
  }
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, __dirname, 'VITE_')
  const siteOrigin = resolveSiteOrigin(command, process.env.VITE_SITE_ORIGIN || env.VITE_SITE_ORIGIN)

  return {
    plugins: [react(), seoFilesPlugin(siteOrigin)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@drcip/contracts': path.resolve(__dirname, '../shared/contracts/src/index.ts'),
      },
    },
    server: {
      port: 5173,
      host: '0.0.0.0',
      proxy: {
        '/api': 'http://localhost:5000',
        '/ws': 'http://localhost:5000',
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return
            if (id.includes('chart.js') || id.includes('react-chartjs-2')) return 'vendor-charts'
            if (id.includes('leaflet')) return 'vendor-maps'
            if (id.includes('gsap')) return 'vendor-motion'
            if (id.includes('@tanstack')) return 'vendor-query'
            return 'vendor'
          },
        },
      },
    },
  }
})
