import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import prerender from '@prerenderer/rollup-plugin'
import path from 'path'
import fs from 'fs'

// The interview index page shows per-section question counts and how many the
// user has completed. That used to mean downloading all ~2 MB of lesson JSON
// just to tally it. This plugin reads the lesson files at build time and emits
// a compact manifest instead (counts plus question ids, ~18 KB), so the page
// needs no question bodies at all. Derived on every build, so it cannot drift
// from the JSON the way a committed generated file would.
const INTERVIEW_MANIFEST_ID = 'virtual:interview-manifest'
const INTERVIEW_MANIFEST_RESOLVED = '\0' + INTERVIEW_MANIFEST_ID
const LESSONS_DIR = path.resolve(__dirname, 'src/module/student/interview-prep/data/lessons')

interface ManifestQuestion { id: string; difficulty: string }

function buildInterviewManifest() {
  const manifest: Record<string, unknown> = {}
  for (const file of fs.readdirSync(LESSONS_DIR).filter((f) => f.endsWith('.json'))) {
    const questions: ManifestQuestion[] = JSON.parse(
      fs.readFileSync(path.join(LESSONS_DIR, file), 'utf8'),
    )
    // Section id matches the JSON basename, same convention data/index.ts uses.
    manifest[file.replace(/\.json$/, '')] = {
      total: questions.length,
      easy: questions.filter((q) => q.difficulty === 'Beginner').length,
      medium: questions.filter((q) => q.difficulty === 'Intermediate').length,
      hard: questions.filter((q) => q.difficulty === 'Advanced').length,
      ids: questions.map((q) => q.id),
    }
  }
  return manifest
}

function interviewManifestPlugin() {
  return {
    name: 'interview-manifest',
    resolveId(id: string) {
      return id === INTERVIEW_MANIFEST_ID ? INTERVIEW_MANIFEST_RESOLVED : undefined
    },
    load(id: string) {
      if (id !== INTERVIEW_MANIFEST_RESOLVED) return undefined
      return `export const interviewManifest = ${JSON.stringify(buildInterviewManifest())};`
    },
    // Keep dev in sync when a lesson file is edited.
    configureServer(server: { watcher: { add: (p: string) => void; on: (e: string, cb: (f: string) => void) => void }; moduleGraph: { getModuleById: (id: string) => unknown }; reloadModule: (m: never) => void }) {
      server.watcher.add(LESSONS_DIR)
      server.watcher.on('change', (file: string) => {
        if (!file.startsWith(LESSONS_DIR)) return
        const mod = server.moduleGraph.getModuleById(INTERVIEW_MANIFEST_RESOLVED)
        if (mod) server.reloadModule(mod as never)
      })
    },
  }
}

// Every lesson and interview question is a public, indexable page, but the
// content lives in JSON under src/, so the server that serves /sitemap.xml
// cannot see it. This plugin walks the same lesson files at build time and
// emits sitemap-learn.xml as a static asset, which the sitemap index on the
// API then points at. Derived on every build, so it tracks the JSON exactly.
const SITE_URL = 'https://www.internhack.xyz'
const STUDENT_DIR = path.resolve(__dirname, 'src/module/student')

// Content directory name -> /learn/<segment>. Only these have lesson JSON laid
// out as data/lessons/<sectionId>.json with an array of { id }.
const LEARN_SEGMENTS: Record<string, string> = {
  javascript: 'javascript',
  typescript: 'typescript',
  react: 'react',
  python: 'python',
  nodejs: 'nodejs',
  html: 'html',
  css: 'css',
  django: 'django',
  flask: 'flask',
  fastapi: 'fastapi',
  blockchain: 'blockchain',
  'data-analytics': 'data-analytics',
  'interview-prep': 'interview',
}

interface LearnEntry { loc: string; priority: string }

function collectLearnUrls(): LearnEntry[] {
  const entries: LearnEntry[] = []
  for (const [dir, segment] of Object.entries(LEARN_SEGMENTS)) {
    const lessonsDir = path.join(STUDENT_DIR, dir, 'data/lessons')
    if (!fs.existsSync(lessonsDir)) continue

    // Only section and lesson URLs here. The /learn/<segment> hubs are owned by
    // the pages section of the server sitemap; emitting them in both would list
    // the same URL in two children of the index.
    for (const file of fs.readdirSync(lessonsDir).filter((f) => f.endsWith('.json'))) {
      const sectionId = file.replace(/\.json$/, '')
      entries.push({ loc: `${SITE_URL}/learn/${segment}/${sectionId}`, priority: '0.7' })

      let items: { id?: string }[]
      try {
        items = JSON.parse(fs.readFileSync(path.join(lessonsDir, file), 'utf8'))
      } catch {
        continue
      }
      if (!Array.isArray(items)) continue

      for (const item of items) {
        if (!item?.id) continue
        entries.push({
          loc: `${SITE_URL}/learn/${segment}/${sectionId}/${item.id}`,
          priority: '0.6',
        })
      }
    }
  }
  return entries
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function learnSitemapPlugin(): Plugin {
  // The shell as Vite finishes it: hashed asset tags injected, #root still empty.
  // Captured here because by the time the build is on disk, the prerender plugin
  // has replaced dist/index.html with the fully rendered homepage, which is
  // useless as a template for the lesson pages.
  let pristineShell: string | null = null

  return {
    name: 'learn-sitemap',
    apply: 'build' as const,
    transformIndexHtml: {
      order: 'post' as const,
      handler(html: string) {
        pristineShell = html
        return html
      },
    },
    // closeBundle runs after dist/ has been written, so this is a plain write
    // rather than an emitted asset. scripts/generate-seo-pages.mjs consumes it
    // and deletes it, so it never ships.
    closeBundle() {
      if (pristineShell === null) {
        console.warn('[learn-sitemap] never saw index.html, no pristine SEO shell written')
        return
      }
      const out = path.resolve(__dirname, 'dist/seo-shell.html')
      fs.writeFileSync(out, pristineShell, 'utf8')
    },
    generateBundle() {
      const urls = collectLearnUrls()
      const body = urls
        .map(
          (u) =>
            `  <url>\n    <loc>${escapeXml(u.loc)}</loc>\n` +
            `    <changefreq>monthly</changefreq>\n` +
            `    <priority>${u.priority}</priority>\n  </url>`,
        )
        .join('\n')
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap-learn.xml',
        source:
          '<?xml version="1.0" encoding="UTF-8"?>\n' +
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
          `${body}\n</urlset>\n`,
      })
      console.log(`[learn-sitemap] emitted sitemap-learn.xml with ${urls.length} URLs`)
    },
  }
}

// Routes to prerender to static HTML at build time. Only include pages that
// render the same content for every visitor (no auth, no per-user data).
const PRERENDER_ROUTES = [
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/terms',
  '/privacy',
  '/refund',
  '/contact',
  '/external-jobs',
  '/internships',
  '/companies',
  '/roadmaps',
  '/opensource',
  '/grants',
  '/ats-score',
  '/contributors',
  '/learn',
  '/learn/javascript',
  '/learn/python',
  '/learn/html',
  '/learn/css',
  '/learn/react',
  '/learn/typescript',
  '/learn/nodejs',
  '/learn/fastapi',
  '/learn/flask',
  '/learn/django',
  '/learn/blockchain',
  '/learn/data-analytics',
  '/learn/interview',
  '/learn/dsa',
  '/learn/dsa/companies',
  '/learn/aptitude',
  '/learn/aptitude/companies',
  '/learn/sql',
  '/learn/sql/playground',
  '/learn/exam-prep',
]

// Vercel's build container is missing Chrome's system libs (libnspr4.so, etc.),
// so puppeteer can't launch and the prerender plugin hard-fails the build.
// Skip the plugin on Vercel and rely on local prerendering (or skip SEO snapshot
// for that deploy). Override via SKIP_PRERENDER=1 to disable elsewhere.
//
// This only covers the app-shell routes below. The ~1,400 lesson and interview
// pages are handled by scripts/generate-seo-pages.mjs instead, which templates
// their HTML straight from the lesson JSON with no browser, so they get real
// crawlable content on every build including on Vercel.
const skipPrerender =
  process.env.SKIP_PRERENDER === '1' || process.env.VERCEL === '1'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    interviewManifestPlugin(),
    learnSitemapPlugin(),
    ...(skipPrerender
      ? []
      : [
          prerender({
            routes: PRERENDER_ROUTES,
            renderer: '@prerenderer/renderer-puppeteer',
            rendererOptions: {
              // Give React.lazy() chunks and react-helmet enough time to commit
              // <title>, meta, and JSON-LD before snapshotting. Serial rendering
              // avoids chunk-load races that cause sporadic empty captures.
              renderAfterTime: 4500,
              maxConcurrentRoutes: 1,
              headless: true,
              timeout: 30000,
            },
          }),
        ]),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: { '.keep': 'text' },
    },
  },
server: {
  headers: {
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    'Cross-Origin-Embedder-Policy': 'unsafe-none',
  },
  proxy: {
    // Proxy sitemap.xml to backend so it works in development
    '/sitemap.xml': {
      target: 'http://localhost:3000',
      changeOrigin: true,
    },
    // Proxy API requests to backend in development. 
    '/api': {
      target: 'http://localhost:3000',
      changeOrigin: true,
      secure: false,
    },
  },
},
  test: {
    globals: true,
    environment: "node",
  },
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // Use function form so we can split both vendor AND lesson-data into
        // stable, separately-cacheable chunks. Without this, all 5.4 MB of
        // lesson JSON gets inlined into each language's lazy page chunk.
        manualChunks(id) {
          // ── Vendor splits ────────────────────────────────────────
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/') || id.includes('node_modules/react-router')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/react-hot-toast') || id.includes('node_modules/lucide-react') || id.includes('node_modules/framer-motion')) {
            return 'vendor-ui';
          }
          if (id.includes('node_modules/@tanstack/react-query')) {
            return 'vendor-query';
          }

          // ── Lesson data splits (5.4 MB total, ~114 JSON files) ───
          // Each language's lesson JSON is placed in its own chunk so:
          //  1. It is downloaded only when that language's page is visited.
          //  2. It gets its own cache fingerprint, UI changes don't bust
          //     the lesson-data cache and vice-versa.
          if (id.includes('/module/student/javascript/data')) return 'learn-data-js';
          if (id.includes('/module/student/typescript/data')) return 'learn-data-ts';
          if (id.includes('/module/student/react/data'))       return 'learn-data-react';
          if (id.includes('/module/student/python/data'))      return 'learn-data-python';
          if (id.includes('/module/student/css/data'))         return 'learn-data-css';
          if (id.includes('/module/student/html/data'))        return 'learn-data-html';
          if (id.includes('/module/student/nodejs/data'))      return 'learn-data-node';
          if (id.includes('/module/student/django/data'))      return 'learn-data-django';
          if (id.includes('/module/student/flask/data'))          return 'learn-data-flask';
          if (id.includes('/module/student/fastapi/data'))        return 'learn-data-fastapi';
          if (id.includes('/module/student/blockchain/data'))     return 'learn-data-blockchain';
          // interview-prep is deliberately absent: its data/index.ts loads each
          // lesson file via import.meta.glob, so Rollup already gives every
          // section its own chunk. Naming one here would merge all 18 back into
          // a single 2 MB chunk and undo the per-section loading.
        },
      },
    },
  },
})
