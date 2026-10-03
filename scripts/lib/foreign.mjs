/**
 * Source checkouts for packages that own a namespace this corpus back-fills
 * but that do not ship inside the harness.
 *
 * The harness checkout is what gives the dictionary gate its list of
 * namespaces to watch. A namespace owned by a plugin repository does not come
 * with it, and a corpus file for one would otherwise be invisible: the gate
 * would neither report a key its owner adds — which renders English forever,
 * in the one locale the reader of this repository is least likely to notice —
 * nor one its owner retires, whose translation then sits in `dict/` answering
 * a key nothing asks for.
 *
 * Resolution mirrors `harnessRoot`: `DSH_FOREIGN_DIRS` names checkouts
 * explicitly, otherwise each package is looked for beside this repository —
 * which is where a Negen working copy already sits.
 */

import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * Packages read beside the harness.
 *
 * `source` is relative to the package's root and `probe` is what makes a
 * directory count as its checkout, so a same-named unrelated directory beside
 * this one is skipped rather than misread.
 */
export const FOREIGN_PACKAGES = [
  {
    package: 'negen-archive',
    source: '.',
    probe: join('src', 'client', 'locales.ts'),
    neighbours: ['negen-archive'],
  },
]

/**
 * Resolve every foreign package's source directory.
 * @param root - this repository's root.
 * @returns the checkouts that were found, in declaration order.
 */
export function foreignSources(root) {
  const named = (process.env.DSH_FOREIGN_DIRS ?? '')
    .split(':')
    .filter(part => part !== '')
    .map(part => resolve(part))
  const parent = resolve(root, '..')
  const found = []
  for (const entry of FOREIGN_PACKAGES) {
    const candidates = [
      ...named.filter(dir => existsSync(join(dir, entry.probe))),
      ...entry.neighbours.map(name => join(parent, name)),
    ]
    const dir = candidates.find(candidate => existsSync(join(candidate, entry.probe)))
    if (dir === undefined) continue
    found.push({ package: entry.package, src: join(dir, entry.source, 'src'), root: resolve(dir) })
  }
  return found
}
