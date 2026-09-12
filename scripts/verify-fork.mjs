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
 */
const FORKED = [
  'packages/client/locale/src/index.ts',
  'packages/client/locale/src/locale-settings.ts',
  'packages/client/locale/src/client/index.ts',
  'packages/client/locale/src/client/LanguageRow.tsx',
  'packages/client/locale/src/client/LanguageRow.module.css',
  'packages/client/locale/src/client/settings-store.ts',
  'packages/client/locale/src/locales/index.ts',
  'packages/client/locale/src/locales/en.ts',
  'packages/client/locale/src/locales/zh.ts',
  'packages/client/locale/src/locales/settings.ts',
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
    file: 'packages/client/ui-renderer/src/client/registry.ts',
    why: 'installLocale is how this package becomes the locale face, and it is boot-once',
    contains: ['installLocale(face: LocaleFace)', 'locale face already installed'],
  },
  {
    file: 'packages/client/ui-slots/src/renderer.ts',
    why: 'LocaleFace is the contract LocaleRuntime satisfies',
    contains: ['interface LocaleFace', 'bind(ns: string): Translate'],
  },
  {
    file: 'packages/client/ui-theme/src/styles/base.css',
    why: 'src/client/fonts.ts redefines these two by name; a renamed or added font variable keeps upstream\'s Simplified Chinese stack in force',
    contains: ['--dsw-font-family:', '--ds-font-family-code:'],
  },
  {
    file: 'packages/bundle/web-app/cordis.patch.yml',
    why: 'cordis.patch.yml disables this row by id; a renamed row would silently leave two locale plugins mounted',
    contains: ['id: locale', "name: '@deepseek-ai/dsh-client-locale'"],
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
