#!/usr/bin/env node
/**
 * Check the full zh-TW curation round for completeness and Simplified
 * characters.
 *
 * `verify-dicts.mjs` judges the gate-driven batches, which is the set
 * `needsCuration` already knows about. This judges the wider set built by
 * `worklist.mjs`, where the failure mode is different: a value can be free
 * of mainland vocabulary and still carry a Simplified-only glyph the conversion
 * table never mapped (`报`, `绘`, `异`, `凑`, `强`), which is exactly the class
 * of miss the term table cannot see. So the character check is the point.
 *
 * Usage: node scripts/check-translations.mjs
 */

import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { needsCuration } from './lib/zh-tw-terms.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const batchDir = join(root, '.work', 'zh-TW')
const outDir = join(root, '.work', 'translated', 'zh-TW')

/** `{name}` and friends, as they appear in either the source or the translation. */
function placeholders(text) {
  return [...text.matchAll(/\{[^}\s]+\}/g)].map(m => m[0]).sort()
}

/**
 * The characters the conversion table deliberately leaves alone, because each
 * has more than one Traditional form and only the surrounding word decides
 * which. A curated value still carrying one was not curated far enough.
 */
const AMBIGUOUS_ONLY = /[复并余里]/

/**
 * Characters that are Simplified and nothing else.
 *
 * Every one of these was found surviving a curated value during this round, so
 * the list is evidence rather than theory: `绘` in 正在绘制頁面, `异` in 收起差异,
 * `报` in 未报告用量, `凑` in 緊凑, `强` in 推理强度. None exists in Traditional
 * text, so one appearing in a curated value is a miss the converter was
 * supposed to have rewritten.
 *
 * Deliberately not derived from `dict/zh-tw-chars.json`: that table holds
 * one-way maps beside context-dependent pairs, and the pair is why. It maps
 * `准` to `準` because every Simplified string upstream writes with it is the
 * 標準 sense (标准, 准备), but `准` is a real Traditional character in the
 * permit sense — 核准, 准許 — so 等待核准 is correct Taiwan usage and a table
 * membership test would call it a defect.
 */
const SIMPLIFIED_ONLY = /[报绘异凑强]/

/**
 * Characters no curated value may contain.
 * @param produced - the curated value.
 * @returns the offending characters.
 */
function leftoverSimplified(produced) {
  return [...new Set([...produced].filter(ch => SIMPLIFIED_ONLY.test(ch)))]
}

const problems = []
let checked = 0

if (!existsSync(batchDir)) {
  console.error(`no worklist at ${batchDir} — run scripts/worklist.mjs first`)
  process.exit(1)
}
if (!existsSync(outDir)) {
  console.error(`no output at ${outDir}`)
  process.exit(1)
}

const produced = new Map()
for (const file of (await readdir(outDir)).filter(f => f.endsWith('.json'))) {
  const ns = file.slice(0, -'.json'.length)
  for (const [key, value] of Object.entries(JSON.parse(await readFile(join(outDir, file), 'utf8')))) {
    produced.set(`${ns}\u0000${key}`, value)
  }
}

for (const file of (await readdir(batchDir)).filter(f => f.endsWith('.json') && !f.startsWith('_'))) {
  const ns = file.slice(0, -'.json'.length)
  for (const [key, entry] of Object.entries(JSON.parse(await readFile(join(batchDir, file), 'utf8')))) {
    const value = produced.get(`${ns}\u0000${key}`)
    if (value === undefined) { problems.push(`${ns}/${key}: not curated`); continue }
    checked += 1
    if (typeof value !== 'string') { problems.push(`${ns}/${key}: value is ${typeof value}`); continue }
    const trimmed = value.trim()
    if (trimmed === '') { problems.push(`${ns}/${key}: empty`); continue }
    const want = placeholders(entry.en)
    const got = placeholders(value)
    if (want.join(' ') !== got.join(' ')) {
      problems.push(`${ns}/${key}: placeholders ${JSON.stringify(want)} became ${JSON.stringify(got)}`)
      continue
    }
    const simplified = leftoverSimplified(trimmed)
    if (simplified.length > 0) {
      problems.push(`${ns}/${key}: Simplified character(s) ${simplified.join('')} in ${trimmed}`)
    }
    if (AMBIGUOUS_ONLY.test(trimmed)) {
      problems.push(`${ns}/${key}: ambiguous character left native in ${trimmed}`)
    }
    if (needsCuration(trimmed)) {
      problems.push(`${ns}/${key}: reads as mainland Chinese (${trimmed})`)
    }
  }
}

console.log(`checked ${checked} curated key(s)`)
if (problems.length === 0) {
  console.log('ok: every unconverted key is curated, no Simplified characters, no mainland wording')
} else {
  console.error(`\n${problems.length} problem(s):`)
  for (const problem of problems.slice(0, 60)) console.error(`  - ${problem}`)
  if (problems.length > 60) console.error(`  … and ${problems.length - 60} more`)
  process.exit(1)
}
