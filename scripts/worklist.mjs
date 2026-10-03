#!/usr/bin/env node
/**
 * Build the translation worklist: every key that still needs a curated value.
 *
 * For ja and ko that is every key with no entry at all — without one it renders
 * English. For zh-TW it is every key still reading through the character
 * converter, which is a wider set than the gate reports: the gate flags the keys
 * whose conversion keeps mainland vocabulary, but a converted string can be free
 * of that and still be wrong about a character the conversion table does not
 * carry. Curating the whole namespace is what makes the locale literally
 * complete rather than "complete minus the keys nobody objected to".
 *
 * Each entry carries what a translator needs and nothing they have to look for:
 * the English source, upstream's Simplified string as the semantic anchor,
 * whatever the locale renders today, and the namespace's existing entries for
 * register and terminology.
 *
 * Usage: node scripts/worklist.mjs [path/to/deepseek-harness]
 */

import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { convertZhTw } from '../src/client/convert.ts'
import { extractDictionaries } from './lib/extract-dicts.mjs'
import { harnessRoot } from './lib/harness.mjs'
import { foreignSources } from './lib/foreign.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const workRoot = join(root, '.work')
const harness = harnessRoot(root)
const { namespaces } = await extractDictionaries(harness, foreignSources(root))

/** Locale id -> directory under dict/. */
const DIRS = { 'zh-TW': 'zh-tw', ja: 'ja', ko: 'ko' }

/** Read this repository's whole corpus for one locale. */
async function readLocale(locale) {
  const corpus = {}
  const dir = join(root, 'dict', DIRS[locale])
  if (existsSync(dir)) {
    for (const file of (await readdir(dir)).filter(f => f.endsWith('.json'))) {
      corpus[file.slice(0, -'.json'.length)] = JSON.parse(await readFile(join(dir, file), 'utf8'))
    }
  }
  return corpus
}

await rm(workRoot, { recursive: true, force: true })

const report = {}
for (const locale of Object.keys(DIRS)) {
  const corpus = await readLocale(locale)
  const outDir = join(workRoot, locale)
  await mkdir(outDir, { recursive: true })
  let count = 0
  for (const [ns, live] of Object.entries(namespaces)) {
    const entries = {}
    for (const [key, en] of Object.entries(live.en)) {
      const here = corpus[ns]?.[key]
      const zh = live.zh?.[key]
      if (locale === 'zh-TW') {
        // A curated value already reads correctly, so only a key with none is work.
        if (here !== undefined) continue
        entries[key] = { en, zh: zh ?? null, converted: zh === undefined ? null : convertZhTw(zh) }
      } else if (here === undefined) {
        entries[key] = { en, zh: zh ?? null }
      }
    }
    if (Object.keys(entries).length === 0) continue
    // Register and terminology: what this namespace already renders.
    const neighbours = Object.fromEntries(Object.entries(corpus[ns] ?? {}).slice(0, 40))
    for (const entry of Object.values(entries)) entry.neighbours = neighbours
    await writeFile(join(outDir, `${ns.replace(/[^\w.-]/g, '_')}.json`), `${JSON.stringify(entries, null, 2)}\n`, 'utf8')
    count += Object.keys(entries).length
  }
  report[locale] = count
}

for (const [locale, count] of Object.entries(report)) {
  console.log(`${locale.padEnd(6)} ${String(count).padStart(4)} key(s) to curate`)
}
console.log(`\nwrote ${join(workRoot, '<locale>')}`)
