#!/usr/bin/env node
/**
 * Report the characters upstream's Simplified text uses that the zh-TW
 * conversion table cannot rewrite.
 *
 * The table is the last rung of the zh-TW fallback chain, so a character
 * missing from it silently leaves a Simplified glyph on a Traditional screen.
 * Nothing else notices — the string still renders. This is the only thing
 * that counts them.
 *
 * A character listed here is not automatically a bug: most Han characters are
 * identical in both scripts and belong in no table. The list is a worklist to
 * read, not a failure.
 *
 * Usage: node scripts/collect-chars.mjs [path/to/deepseek-harness]
 */

import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractDictionaries } from './lib/extract-dicts.mjs'
import { harnessRoot } from './lib/harness.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const table = JSON.parse(await readFile(join(root, 'dict', 'zh-tw-chars.json'), 'utf8'))
const harness = harnessRoot(root)
const { namespaces } = await extractDictionaries(harness)

const HAN = /\p{Script=Han}/u
const seen = new Map()
for (const [ns, entry] of Object.entries(namespaces)) {
  for (const text of Object.values(entry.zh)) {
    for (const ch of text) {
      if (!HAN.test(ch)) continue
      if (!seen.has(ch)) seen.set(ch, new Set())
      seen.get(ch).add(ns)
    }
  }
}

const covered = [...seen.keys()].filter(ch => table[ch] !== undefined)
const uncovered = [...seen.keys()].filter(ch => table[ch] === undefined).sort()

console.log(`table:      ${Object.keys(table).length} characters`)
console.log(`upstream:   ${seen.size} distinct Han characters across ${Object.keys(namespaces).length} namespaces`)
console.log(`converted:  ${covered.length}`)
console.log(`unconverted:${String(uncovered.length).padStart(4)}`)
console.log(`\nCharacters the table leaves alone (most are correct — identical in both scripts):`)
console.log(`  ${uncovered.join('')}`)
