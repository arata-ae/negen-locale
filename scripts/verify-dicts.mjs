#!/usr/bin/env node
/**
 * Dictionary-drift gate.
 *
 * Upstream packages register `{ zh, en }` for their own namespaces and know
 * nothing about this plugin, so every Japanese string for them lives in
 * `dict/`.
 * That corpus is a copy of someone else's text, and copies rot: upstream adds
 * a key and it renders English forever, upstream rewords a key and the
 * translation beside it now describes something that is no longer on screen.
 * Neither shows up as an error anywhere. This is what makes them show up.
 *
 * Failures — things that are wrong right now:
 *   - a key was reworded upstream and this repo has a translation of the old text
 *   - a key was removed upstream and this repo still carries a translation
 *   - a namespace disappeared while translations for it remain
 *
 * Reports — things to do, not things that are broken:
 *   - new upstream keys with no translation yet (they render English, by design)
 *   - per-locale coverage
 *
 * Usage:
 *   node scripts/verify-dicts.mjs [path/to/deepseek-harness]
 *   node scripts/verify-dicts.mjs --write   # accept the current upstream text
 */

import { existsSync } from 'node:fs'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { convertZhTw } from '../src/client/convert.ts'
import { extractDictionaries, readOwnDictionary } from './lib/extract-dicts.mjs'
import { needsCuration } from './lib/zh-tw-terms.mjs'
import { checkoutCommit, checkoutTag, harnessRoot } from './lib/harness.mjs'
import { LOCALE_DIRS, OWNED_NAMESPACES } from './assemble-dicts.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const snapshotPath = join(root, 'dict', 'upstream.snapshot.json')

/**
 * Namespaces this plugin registers from TypeScript rather than back-filling
 * from `dict/`, because it owns them outright: it replaced the upstream
 * plugin that declared them. Their dictionaries are compile-checked against
 * the en key set, so they never carry a key of their own invention — but
 * upstream can still add one, which is exactly what this gate must see.
 */
const OWNED = {
  'common': join(root, 'src', 'locales'),
  'settings.locale': join(root, 'src', 'locales', 'settings.ts'),
}
if (Object.keys(OWNED).join() !== OWNED_NAMESPACES.join()) {
  throw new Error('OWNED and OWNED_NAMESPACES disagree about which namespaces src/locales/ registers')
}

/**
 * Locale id to the identifier its dictionary is exported under. Only ids that
 * are not valid identifiers need an entry — `zh-TW` cannot be an export name,
 * so the source spells it `zhTW`.
 */
const OWNED_EXPORT = { 'zh-TW': 'zhTW' }

/** Locale id to the source file basename under src/locales/. */
const OWNED_FILE = { 'zh-TW': 'zh-tw' }

/** Read this repository's own corpus: locale id -> namespace -> key -> text. */
async function readCorpus() {
  const corpus = {}
  for (const [dir, id] of Object.entries(LOCALE_DIRS)) {
    const localeRoot = join(root, 'dict', dir)
    corpus[id] = {}
    if (!existsSync(localeRoot)) continue
    for (const file of (await readdir(localeRoot)).filter(f => f.endsWith('.json'))) {
      corpus[id][file.slice(0, -'.json'.length)] = JSON.parse(await readFile(join(localeRoot, file), 'utf8'))
    }
  }
  for (const [ns, path] of Object.entries(OWNED)) {
    for (const id of Object.keys(corpus)) {
      const file = path.endsWith('.ts') ? path : join(path, `${OWNED_FILE[id] ?? id}.ts`)
      if (!existsSync(file)) continue
      const entries = await readOwnDictionary(file, OWNED_EXPORT[id] ?? id)
      if (Object.keys(entries).length > 0) corpus[id][ns] = entries
    }
  }
  return corpus
}

const harness = harnessRoot(root)
const forkPoint = JSON.parse(await readFile(join(root, 'fork-point.json'), 'utf8'))
const commit = checkoutCommit(harness) ?? 'unknown'
const atForkPoint = commit === forkPoint.commit
console.log(`checkout:   ${harness}`)
console.log(`commit:     ${commit.slice(0, 12)}${atForkPoint ? ` (${forkPoint.tag})` : ` — NOT the fork point ${forkPoint.commit.slice(0, 12)}`}`)
const { namespaces, unreadable } = await extractDictionaries(harness)

if (process.argv.includes('--write')) {
  // Recording from a checkout that is not the fork point bakes another
  // release's text into the baseline, and every later run then measures drift
  // from the wrong place. DSH_TAG is how you say you meant to move the pin.
  if (!atForkPoint && process.env.DSH_TAG === undefined) {
    console.error(`\nrefusing to record: this checkout is not ${forkPoint.tag}.`)
    console.error('  point the gate at the pinned checkout, or set DSH_TAG to record a new pin.')
    process.exit(1)
  }
  const snapshot = {
    tag: process.env.DSH_TAG ?? checkoutTag(harness) ?? forkPoint.tag,
    commit,
    unreadable,
    namespaces: Object.fromEntries(
      Object.entries(namespaces)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([ns, v]) => [ns, { package: v.package, en: v.en }]),
    ),
  }
  await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
  const keys = Object.values(snapshot.namespaces).reduce((n, v) => n + Object.keys(v.en).length, 0)
  console.log(`recorded ${Object.keys(snapshot.namespaces).length} namespaces, ${keys} keys at ${snapshot.commit.slice(0, 12)}`)
  process.exit(0)
}

const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'))
const corpus = await readCorpus()
const failures = []
const reports = []

/** Every locale that has a translation for this namespace/key. */
function translatedIn(ns, key) {
  return Object.keys(corpus).filter(id => corpus[id][ns]?.[key] !== undefined)
}

// --- upstream moved under us -------------------------------------------------
for (const [ns, recorded] of Object.entries(snapshot.namespaces)) {
  const live = namespaces[ns]
  if (live === undefined) {
    const stranded = Object.keys(corpus).filter(id => corpus[id][ns] !== undefined)
    if (stranded.length > 0) {
      failures.push(`namespace "${ns}" is gone upstream, but ${stranded.join(', ')} still carry translations for it`)
    } else {
      reports.push(`namespace "${ns}" is gone upstream (nothing translated it)`)
    }
    continue
  }
  for (const [key, text] of Object.entries(recorded.en)) {
    const now = live.en[key]
    const holders = translatedIn(ns, key)
    if (now === undefined) {
      if (holders.length > 0) {
        failures.push(`${ns}/${key} was removed upstream, but ${holders.join(', ')} still translate it`)
      }
      continue
    }
    if (now !== text && holders.length > 0) {
      failures.push(
        `${ns}/${key} was reworded upstream and ${holders.join(', ')} translate the old text\n`
        + `      was: ${JSON.stringify(text)}\n`
        + `      now: ${JSON.stringify(now)}`,
      )
    }
  }
}

// --- new upstream keys -------------------------------------------------------
let added = 0
for (const [ns, live] of Object.entries(namespaces)) {
  const recorded = snapshot.namespaces[ns]
  if (recorded === undefined) {
    reports.push(`new namespace upstream: ${ns} (${Object.keys(live.en).length} keys, ${live.package})`)
    added += Object.keys(live.en).length
    continue
  }
  const fresh = Object.keys(live.en).filter(k => recorded.en[k] === undefined)
  if (fresh.length > 0) {
    reports.push(`${ns}: ${fresh.length} new key(s) upstream`)
    added += fresh.length
  }
}

// --- stale translations against namespaces that still exist ------------------
for (const [id, byNamespace] of Object.entries(corpus)) {
  for (const [ns, entries] of Object.entries(byNamespace)) {
    const live = namespaces[ns]
    if (live === undefined) continue
    const unknown = Object.keys(entries).filter(k => live.en[k] === undefined)
    if (unknown.length > 0) {
      failures.push(`${id}/${ns}: ${unknown.length} translated key(s) upstream does not have: ${unknown.slice(0, 5).join(', ')}${unknown.length > 5 ? ' …' : ''}`)
    }
  }
}

// --- zh-TW keys whose conversion is not enough ---------------------------------
// zh-TW reads through the character converter when nothing is curated, which
// is correct for most keys and wrong for any whose wording is mainland-only.
// Those are reported, not failed: they render Chinese either way.
const mainland = []
for (const [ns, live] of Object.entries(namespaces)) {
  for (const [key, zh] of Object.entries(live.zh ?? {})) {
    if (corpus['zh-TW']?.[ns]?.[key] !== undefined) continue
    if (needsCuration(convertZhTw(zh))) mainland.push(`${ns}/${key}`)
  }
}
if (mainland.length > 0) {
  reports.push(
    `zh-TW: ${mainland.length} uncovered key(s) convert to Traditional but keep mainland wording`
    + ` (${mainland.slice(0, 3).join(', ')}${mainland.length > 3 ? ' …' : ''})`,
  )
}

// A curated string is hand-written, so nothing else looks at its vocabulary —
// which is how 後台 and 計劃 reached this repository in the first place. The
// same table that decides an uncovered key needs curation decides whether a
// curated one actually did the job, and here it is a failure rather than a
// report: someone wrote this text on purpose.
const curatedMainland = []
for (const [ns, entries] of Object.entries(corpus['zh-TW'] ?? {})) {
  for (const [key, text] of Object.entries(entries)) {
    if (needsCuration(text)) curatedMainland.push(`${ns}/${key}: ${text}`)
  }
}
if (curatedMainland.length > 0) {
  failures.push(
    `zh-TW: ${curatedMainland.length} curated string(s) still read as mainland Chinese\n`
    + curatedMainland.map(entry => `      ${entry}`).join('\n'),
  )
}

// --- coverage ----------------------------------------------------------------
const total = Object.values(namespaces).reduce((n, v) => n + Object.keys(v.en).length, 0)
console.log(`upstream: ${Object.keys(namespaces).length} namespaces, ${total} keys (${snapshot.tag})`)
for (const id of Object.keys(corpus)) {
  const have = Object.entries(corpus[id])
    .reduce((n, [ns, e]) => n + Object.keys(e).filter(k => namespaces[ns]?.en[k] !== undefined).length, 0)
  const pct = total === 0 ? 0 : Math.round((have / total) * 1000) / 10
  const note = have === total
    ? ' (complete)'
    : id !== 'zh-TW'
      ? ' (uncovered keys render English)'
      // zh-TW is the one locale whose uncovered keys are not a gap: they read
      // through the character converter. Whether that is good enough is what
      // the curation scan just decided, so say which it is rather than leaving
      // the percentage to be read as a hole.
      : mainland.length === 0
        ? ' (the rest convert cleanly)'
        : ` (${mainland.length} of the rest need curation)`
  console.log(`  ${id.padEnd(6)} ${String(have).padStart(4)}/${total}  ${String(pct).padStart(5)}%${note}`)
}

if (unreadable.length > 0) {
  console.log(`\n${unreadable.length} upstream entr(ies) this gate cannot read, so it cannot watch them:`)
  for (const entry of unreadable) console.log(`  - ${entry}`)
}

if (reports.length > 0) {
  console.log(`\nto do (${added} untranslated key(s)):`)
  for (const report of reports) console.log(`  - ${report}`)
}

if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s) — translations that no longer match upstream:`)
  for (const failure of failures) console.error(`  - ${failure}`)
  console.error('\nFix the affected dict/ entries, then accept the new upstream text with:')
  console.error('  node scripts/verify-dicts.mjs --write')
  process.exit(1)
}

console.log('\nok: no translation contradicts upstream')
