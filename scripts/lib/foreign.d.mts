/**
 * The typed face of the sibling-checkout registry, so the gates and the tests
 * that resolve one compile under the same settings as the sources.
 */

/** One package whose namespace this corpus back-fills, and where to find it. */
export interface ForeignPackage {
  /** Package name, recorded as the namespace's owner in the snapshot. */
  package: string
  /** Directory holding `src/`, relative to the package's root. */
  source: string
  /** A path that must exist for a directory to count as this checkout. */
  probe: string
  /** Directory names to try beside this repository, in order. */
  neighbours: readonly string[]
}

/** One resolved sibling checkout. */
export interface ForeignSource {
  /** Package name, recorded as the namespace's owner. */
  package: string
  /** Directory holding the package's `src/`. */
  src: string
  /** The checkout's root: what messages print and what a test copies. */
  root: string
}

/** Packages read beside the harness. */
export const FOREIGN_PACKAGES: readonly ForeignPackage[]

/**
 * Resolve every foreign package's source directory.
 * @param root - this repository's root.
 * @returns the checkouts that were found, in declaration order.
 */
export function foreignSources(root: string): ForeignSource[]
