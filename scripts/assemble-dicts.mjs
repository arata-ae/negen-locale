#!/usr/bin/env node
/**
 * Assemble dict/<locale>/<namespace>.json into one module the browser bundle
 * can import. A bundle cannot read a directory, so the directory is folded
 * into a single artifact at build time.
 *
 * Locale directories are lowercase on disk (`zh-tw`) and carry their real
 * locale id (`zh-TW`) in LOCALE_DIRS below — case-insensitive filesystems
 * make a lowercase directory the only spelling that round-trips.
 */

import { readdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'src', 'client', 'backfill.generated.json')

/**
 * Namespaces this package registers from `src/locales/`, listing every locale
 * in one typed call. A `dict/` file for one of them would have the back-fill
 * loop register the same (namespace, locale) a second time, and the runtime
 * refuses a duplicate occupant — the whole plugin then fails to apply, at boot,
 * with nothing pointing back here. So it is a build error instead.
 */
export const OWNED_NAMESPACES = ['common', 'settings.locale']

/** Locale directory on disk -> the locale id it registers under. */
export const LOCALE_DIRS = { 'zh-tw': 'zh-TW', 'ja': 'ja', 'ko': 'ko' }

/**
 * Read every namespace dictionary for one locale.
 * @param dir - the locale directory name under dict/.
 * @returns namespace -> flat dictionary.
 */
async function readLocale(dir) {
  const localeRoot = join(root, 'dict', dir)
  if (!existsSync(localeRoot)) return {}
  const files = (await readdir(localeRoot)).filter(f => f.endsWith('.json')).sort()
  const namespaces = {}
  for (const file of files) {
    const namespace = file.slice(0, -'.json'.length)
    if (OWNED_NAMESPACES.includes(namespace)) {
      throw new Error(
        `dict/${dir}/${file}: "${namespace}" is registered from src/locales/, so a dict/ file for it`
        + ' would collide at boot. Put the text in src/locales/ instead.',
      )
    }
    const parsed = JSON.parse(await readFile(join(localeRoot, file), 'utf8'))
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value !== 'string') {
        throw new Error(`dict/${dir}/${file}: ${key} is ${typeof value}, dictionaries are flat string maps`)
      }
    }
    namespaces[namespace] = parsed
  }
  return namespaces
}

/**
 * Build the corpus and write it next to the client sources.
 * @returns the assembled corpus.
 */
export async function assemble() {
  const corpus = {}
  for (const [dir, id] of Object.entries(LOCALE_DIRS)) {
    const namespaces = await readLocale(dir)
    corpus[id] = namespaces
    const keys = Object.values(namespaces).reduce((n, d) => n + Object.keys(d).length, 0)
    console.log(`  ${id.padEnd(6)} ${String(Object.keys(namespaces).length).padStart(3)} namespaces, ${keys} keys`)
  }
  await writeFile(out, `${JSON.stringify(corpus, null, 2)}\n`, 'utf8')
  return corpus
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await assemble()
  console.log(`wrote ${out}`)
}
