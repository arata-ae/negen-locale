#!/usr/bin/env node
/**
 * Merge checked translator output into `dict/`.
 *
 * Existing keys stay exactly where they are and new keys are appended in the
 * batch's order, which is upstream's own. These files follow the order upstream
 * declares its keys in, which is neither alphabetical nor grouped —
 * `settings.json` opens with `trigger`, `title`, `close` — so appending keeps
 * the diff to the text that changed plus one reviewable block of additions.
 *
 * Refuses to write a namespace this package registers from `src/locales/`: a
 * `dict/` file for one of those would have the back-fill loop register the same
 * (namespace, locale) twice and take the plugin down at boot. The build refuses
 * it too, and that is the wrong place to find out.
 *
 * Run `check-translations.mjs` first; it catches placeholders and untranslated
 * values that this script would happily write.
 *
 * Usage: node scripts/merge-translations.mjs
 */

import { existsSync } from 'node:fs'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { OWNED_NAMESPACES } from './assemble-dicts.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIRS = { 'zh-TW': 'zh-tw', ja: 'ja', ko: 'ko' }

/**
 * Merge new entries into a dictionary, preserving the order already there.
 * @param existing - the current dictionary, in its authored order.
 * @param incoming - new key -> text, in upstream's key order.
 * @returns a new dictionary object.
 */
function mergeOrdered(existing, incoming) {
  const result = { ...existing }
  for (const [key, text] of Object.entries(incoming)) result[key] = text
  return result
}

for (const [locale, dir] of Object.entries(DIRS)) {
  const outDir = join(root, '.work', 'translated', locale)
  if (!existsSync(outDir)) { console.log(`${locale}: nothing to merge`); continue }
  const dictDir = join(root, 'dict', dir)

  /** namespace -> key -> text, folding `trajectory.a`/`.b` halves back together. */
  const byNamespace = {}
  for (const file of (await readdir(outDir)).filter(f => f.endsWith('.json'))) {
    const ns = file.slice(0, -'.json'.length).replace(/\.[ab]$/, '')
    const entries = JSON.parse(await readFile(join(outDir, file), 'utf8'))
    byNamespace[ns] = { ...(byNamespace[ns] ?? {}), ...entries }
  }

  const owned = Object.keys(byNamespace).filter(ns => OWNED_NAMESPACES.includes(ns))
  if (owned.length > 0) {
    console.error(`${locale}: ${owned.join(', ')} belong in src/locales/, not dict/ — merge them by hand.`)
    process.exitCode = 1
    continue
  }

  let added = 0
  let updated = 0
  for (const [ns, entries] of Object.entries(byNamespace)) {
    const path = join(dictDir, `${ns}.json`)
    const existing = existsSync(path) ? JSON.parse(await readFile(path, 'utf8')) : {}
    const merged = mergeOrdered(existing, entries)
    for (const key of Object.keys(entries)) {
      if (key in existing) updated += 1
      else added += 1
    }
    await writeFile(path, `${JSON.stringify(merged, null, 2)}\n`, 'utf8')
  }
  console.log(`${locale.padEnd(6)} ${added} added, ${updated} updated across ${Object.keys(byNamespace).length} namespace(s)`)
}
