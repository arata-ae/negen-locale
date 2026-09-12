#!/usr/bin/env node
/**
 * Build both halves of the plugin.
 *
 * The host half is an ordinary ESM library. The browser half is the shape
 * DSH's ModuleLoader expects: a CJS bundle wrapped in a
 * `window.__ModuleLoader__.load({ id, factory })` handoff, whose externals
 * are resolved through the injected `require` rather than any global or
 * import map.
 *
 * Upstream builds this with a tsdown preset that only works inside its own
 * monorepo (it globs `packages/*​/*​/package.json` from the repository root),
 * so this is the same contract restated with esbuild.
 */

import { execFileSync } from 'node:child_process'
import { readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { assemble } from './assemble-dicts.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const lib = join(root, 'lib')
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))

/**
 * Specifiers the shell shares into the frozen module table, mirrored from
 * `@deepseek-ai/dsh-client-web/src/platform.ts` (PLATFORM_MODULES plus
 * PRELOADED_CLIENT_EXTERNALS). These stay imports and the loader answers
 * them; anything else must be bundled, because a `require()` the table
 * cannot answer is a guaranteed runtime throw.
 *
 * This list is a seam onto upstream. `scripts/verify-fork.mjs` checks it
 * against the pinned checkout so a shell that shares a different set fails
 * the gate instead of a user's browser.
 */
const MODULE_TABLE = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

console.log('assembling dictionaries')
await assemble()

await rm(lib, { recursive: true, force: true })

console.log('building host half')
await build({
  entryPoints: [join(root, 'src', 'index.ts')],
  outfile: join(lib, 'index.js'),
  bundle: true,
  packages: 'external',
  format: 'esm',
  platform: 'node',
  target: 'es2023',
  sourcemap: true,
})

console.log('building browser half')
await build({
  entryPoints: [join(root, 'src', 'client', 'index.ts')],
  outfile: join(lib, 'client.js'),
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'chrome120',
  external: MODULE_TABLE,
  sourcemap: true,
  // This bundle is mostly CJK dictionary text, and esbuild's default ASCII
  // charset spends six bytes on every `\uXXXX` escape where UTF-8 spends
  // three. The harness serves plugin bundles as
  // `text/javascript; charset=utf-8` and its own bundles already ship raw
  // non-ASCII over that path, so the escaping buys nothing here.
  charset: 'utf8',
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
  },
  banner: {
    js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(manifest.name)}, factory: (require) => { var module = { exports: {} }; var exports = module.exports;`,
  },
  footer: { js: 'return module.exports; } });' },
})

console.log('emitting host declarations')
execFileSync('node', [
  join(root, 'node_modules', 'typescript', 'bin', 'tsc'),
  '-p', join(root, 'tsconfig.build.json'),
], { cwd: root, stdio: 'inherit' })

// tsc writes the specifiers exactly as the source spells them, and this
// project imports with `.ts` extensions. `rewriteRelativeImportExtensions`
// rewrites emitted JS but not emitted declarations, so a shipped `.d.ts`
// would point at a `.ts` file the package does not contain. Rewriting to
// `.js` lands on the sibling `.d.ts`, which is how declaration resolution
// works under every moduleResolution mode.
for (const file of (await readdir(lib)).filter(f => f.endsWith('.d.ts'))) {
  const path = join(lib, file)
  const before = await readFile(path, 'utf8')
  const after = before.replace(/(from\s+'\.[^']*)\.ts'/gu, "$1.js'")
  if (after !== before) await writeFile(path, after, 'utf8')
  if (/from\s+'\.[^']*\.ts'/u.test(after)) {
    throw new Error(`${file} still names a .ts specifier; the package ships no .ts files`)
  }
}

// Bundle purity: the wrapper must be intact, and every Harness specifier the
// bundle still requires must be one the module table actually shares. An
// unlisted require() throws at plugin activation, which is a blank settings
// page rather than an error anyone can read.
const client = await readFile(join(lib, 'client.js'), 'utf8')
if (!client.startsWith('window.__ModuleLoader__.load(')) {
  throw new Error('client bundle lost its ModuleLoader wrapper')
}
const required = [...client.matchAll(/require\(\s*["']([^"']+)["']\s*\)/gu)].map(m => m[1])
const leaked = [...new Set(required.filter(s => !MODULE_TABLE.includes(s)))]
if (leaked.length > 0) {
  throw new Error(
    `client bundle requires specifiers the module table does not share: ${leaked.join(', ')}\n`
    + 'either bundle them or add them to MODULE_TABLE if the shell really shares them',
  )
}

// The dictionaries survived encoding. The bundle is written and read as
// UTF-8 now rather than ASCII-escaped, so a toolchain change that breaks the
// encoding would ship a plugin whose every CJK string is mojibake — visible
// only to someone who reads that language.
for (const label of ['日本語', '한국어', '繁體中文']) {
  if (!client.includes(label)) {
    throw new Error(`client bundle lost its ${label} text; check the output encoding`)
  }
}

// Activation wiring: the plugin body is the one module no test can import
// (Node's type stripper does not load the .tsx the row lives in), so the
// shipped bundle is where its effects are checked. A dropped install is a
// blank Language row or a Chinese-glyphed Japanese UI, neither of which fails
// anything else.
for (const label of ['negen-locale: font fallback', 'negen-locale: language row styles']) {
  if (!client.includes(label)) {
    throw new Error(`client bundle no longer registers the effect ${JSON.stringify(label)}`)
  }
}

// Byte length, not string length: the bundle is UTF-8 and most of it is CJK,
// where one character is three bytes.
const bytes = Buffer.byteLength(client, 'utf8')
console.log(`built ${manifest.name} -> lib/ (client ${(bytes / 1024).toFixed(1)} KB)`)
