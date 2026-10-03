#!/usr/bin/env node
/**
 * Fork-drift gate.
 *
 * Two questions, both about a harness checkout rather than about this code:
 *
 * 1. Did any file this package forked or overrides change upstream? A change
 *    is not automatically a problem — it is a prompt to read the diff and
 *    decide whether this side needs the same edit.
 * 2. Do the upstream seams this package depends on still exist? These are the
 *    things a fork cannot restate for itself: what the shell shares into the
 *    browser module table, the shape of the locale face, and the id of the row
 *    this bundle disables.
 *
 * Usage:
 *   node scripts/verify-fork.mjs [path/to/deepseek-harness]
 *   node scripts/verify-fork.mjs --write   # re-record the fork point
 */

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkoutCommit, checkoutTag, harnessRoot, hashFile } from './lib/harness.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const recordPath = join(root, 'fork-point.json')

/**
 * Upstream files this package forked or overrides, hashed whole. The theme
 * stylesheet is the one it does not fork: `src/client/fonts.ts` redefines its
 * font variables from the cascade, so an upstream edit to them lands here
 * rather than in a merge.
 *
 * This list held eleven files while this package replaced the locale plugin.
 * At 0.2.0 the nine locale-package entries came off it: the package extends
 * that plugin now instead of forking it, so the stylesheet is all that is left
 * to diff. The seams below are what carries the rest.
 */
const FORKED = [
  'packages/client/ui-theme/src/styles/base.css',
]

/**
 * Upstream interfaces this package consumes but does not own. Each is a
 * literal that must still appear in the named file; a miss means the seam
 * moved and something here is now wrong in a way types cannot catch.
 */
const SEAMS = [
  {
    file: 'packages/client/web/src/platform.ts',
    why: 'the browser module table: specifiers scripts/build.mjs must keep external',
    contains: [
      "'react'", "'react/jsx-runtime'", "'react-dom'", "'react-dom/client'",
      "'@deepseek-ai/cordis'",
      "'@deepseek-ai/dsh-client-store'",
      "'@deepseek-ai/dsh-client-ui-slots'",
      "'@deepseek-ai/dsh-client-ui-primitives'",
      "'@deepseek-ai/dsh-client-ui-dockkit'",
    ],
  },
  {
    file: 'packages/client/locale/src/client/index.ts',
    why: 'the extension points this pack registers through: the catalog it widens, the per-locale dictionary it back-fills, and the snapshot it reads to skip a language the composition already carries',
    contains: [
      'addLanguage(input: LanguageRegistration): () => void',
      'register(ns: string, locale: string, dict: LocaleDict): () => void',
      'getSnapshot(): LocaleSnapshot',
    ],
  },
  {
    file: 'packages/bundle/web-app/cordis.patch.yml',
    why: 'the row this pack extends: the built-in plugin provides the locale service and owns the settings namespace, so a composition that drops or renames this row leaves nothing to extend — this patch deliberately inserts no replacement',
    contains: ['id: locale', "name: '@deepseek-ai/dsh-client-locale'"],
  },
  {
    file: 'apps/desktop/src/welcome-backend.ts',
    why: 'the desktop app resolves its welcome copy by finding the settings namespace named "locale" and throws when it is absent — the reason a bundle that disables, renames or re-owns that row makes the app unbootable, and the reason this package stopped replacing the built-in plugin',
    contains: ["item.ns === 'locale'", 'desktop welcome: invalid locale preference'],
  },
  {
    file: 'packages/client/ui-theme/src/styles/base.css',
    why: "src/client/fonts.ts redefines these two by name; a renamed or added font variable keeps upstream's Simplified Chinese stack in force",
    contains: ['--dsw-font-family:', '--ds-font-family-code:'],
  },
]

const harness = harnessRoot(root)
const write = process.argv.includes('--write')

if (write) {
  // A record naming neither a tag nor a commit is a baseline nobody can go
  // back to, and verify-dicts reads this file to decide whether its own
  // checkout is the pinned one — an "unknown" here makes that check answer no
  // forever. Its sibling refuses for the same reason.
  const tag = process.env.DSH_TAG ?? checkoutTag(harness)
  const commit = checkoutCommit(harness)
  if (tag === null || commit === null) {
    console.error(`\nrefusing to record: ${harness}`)
    console.error(tag === null
      ? '  HEAD is not exactly on a release tag. Check out the pinned tag, or set DSH_TAG.'
      : '  the commit cannot be read; this does not look like a git checkout.')
    process.exit(1)
  }
  const files = {}
  for (const relative of FORKED) {
    const hash = await hashFile(join(harness, relative))
    if (hash === null) throw new Error(`cannot record a missing file: ${relative}`)
    files[relative] = hash
  }
  const record = { repository: 'deepseek-ai/deepseek-harness', tag, commit, files }
  await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8')
  console.log(`recorded ${Object.keys(files).length} files at ${record.commit.slice(0, 12)}`)
  process.exit(0)
}

const record = JSON.parse(await readFile(recordPath, 'utf8'))
const problems = []

console.log(`fork point: ${record.tag} (${record.commit.slice(0, 12)})`)
console.log(`checkout:   ${harness}`)

for (const [relative, expected] of Object.entries(record.files)) {
  const actual = await hashFile(join(harness, relative))
  if (actual === null) problems.push(`gone upstream: ${relative}`)
  else if (actual !== expected) problems.push(`changed upstream: ${relative}`)
}

for (const seam of SEAMS) {
  const path = join(harness, seam.file)
  let source
  try {
    source = await readFile(path, 'utf8')
  } catch {
    problems.push(`seam file gone: ${seam.file} — ${seam.why}`)
    continue
  }
  for (const literal of seam.contains) {
    if (!source.includes(literal)) {
      problems.push(`seam moved: ${seam.file} no longer contains ${JSON.stringify(literal)} — ${seam.why}`)
    }
  }
}

if (problems.length === 0) {
  console.log(`ok: ${FORKED.length} forked files unchanged, ${SEAMS.length} seams intact`)
  process.exit(0)
}

console.error(`\n${problems.length} problem(s):`)
for (const problem of problems) console.error(`  - ${problem}`)
console.error('\nRead each diff and decide whether this fork needs the same edit.')
console.error('Once the fork is caught up, re-record with: node scripts/verify-fork.mjs --write')
process.exit(1)
