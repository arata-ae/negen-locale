/**
 * Locating and reading a DeepSeek Harness checkout.
 *
 * Both gates need upstream's own sources to compare against. They are not
 * vendored here — a checkout is named at run time, so the gate can be pointed
 * at whichever pin a consumer actually runs.
 */

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'

/**
 * Paths worth trying before giving up, relative to this repository's parent.
 * Pinned vendor checkouts come first: a loose working clone is whatever its
 * owner last pulled, and baselining against one silently compares this fork
 * to an upstream it was never cut from.
 */
const NEIGHBOURS = [
  'negen/vendors/deepseek-harness',
  'Minke/vendor/deepseek-harness',
  'deepseek-harness',
]

/**
 * Resolve the harness checkout to compare against.
 * @param root - this repository's root.
 * @returns an absolute path.
 * @throws {Error} when no checkout is named or found.
 */
export function harnessRoot(root) {
  // An explicit argument beats the ambient default, so a caller pointing the
  // gate at one checkout is not overridden by an env var meant for another.
  const named = process.argv.slice(2).find(a => !a.startsWith('-')) ?? process.env.DSH_HARNESS
  if (named !== undefined) {
    const abs = resolve(named)
    if (!existsSync(join(abs, 'packages', 'client', 'locale'))) {
      throw new Error(`${abs} does not look like a deepseek-harness checkout`)
    }
    return abs
  }
  const parent = resolve(root, '..')
  for (const candidate of NEIGHBOURS) {
    const abs = join(parent, candidate)
    if (existsSync(join(abs, 'packages', 'client', 'locale'))) return abs
  }
  throw new Error(
    'no deepseek-harness checkout found. Pass one as an argument or set DSH_HARNESS.\n'
    + `  tried: ${NEIGHBOURS.map(n => join(parent, n)).join('\n         ')}`,
  )
}

/**
 * Hash a file's exact bytes.
 * @param path - absolute file path.
 * @returns the lowercase hex sha256, or null when the file is gone.
 */
export async function hashFile(path) {
  if (!existsSync(path)) return null
  return createHash('sha256').update(await readFile(path)).digest('hex')
}

/**
 * Read the release tag a checkout is sitting exactly on.
 *
 * The checkout knows its own version, so neither gate has to carry a hardcoded
 * default that goes stale the moment the pin advances.
 * @param root - the checkout root.
 * @returns the tag, or null when HEAD is not exactly on one.
 */
export function checkoutTag(root) {
  if (!existsSync(join(root, '.git'))) return null
  try {
    const tag = execFileSync('git', ['describe', '--tags', '--exact-match', 'HEAD'], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return tag === '' ? null : tag
  } catch {
    // HEAD is between releases; the caller names the tag or refuses.
    return null
  }
}

/**
 * Read the commit a checkout is currently on.
 * @param root - the checkout root.
 * @returns the commit sha, or null when it cannot be read.
 */
export function checkoutCommit(root) {
  if (!existsSync(join(root, '.git'))) return null
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    // git is absent, or the checkout has no commit yet; the caller reports the
    // commit as unknown and every comparison against the pin then fails loud.
    return null
  }
}
