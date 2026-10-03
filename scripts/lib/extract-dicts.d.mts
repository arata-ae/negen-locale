/**
 * The typed face of the upstream dictionary scanner, so the tests that assert
 * what it can read compile under the same settings as the sources.
 */

/** One namespace's upstream dictionaries. */
export interface ExtractedNamespace {
  /** The upstream client package that owns the namespace. */
  package: string
  /** The declared key-union type name, null for an untyped registration. */
  keyType: string | null
  /** Simplified Chinese dictionary; empty when the package ships none. */
  zh: Record<string, string>
  /** English dictionary — the key set every translation is measured against. */
  en: Record<string, string>
}

/** One checkout read beside the harness: a package that owns a namespace. */
export interface ExtraSource {
  /** Package name, recorded as the namespace's owner. */
  package: string
  /** Directory holding the package's `src/`. */
  src: string
  /** Root that paths in messages are printed relative to. */
  root: string
}

/**
 * Extract every namespace's zh and en dictionaries from a harness checkout,
 * plus any sibling checkouts named in `extraSources`.
 * @param harness - checkout root.
 * @param extraSources - checkouts that own a namespace outside the harness.
 * @returns namespaces by name, plus what the scanner could not read
 * (`unreadable`) and namespaces that declared a key type no dictionary
 * carries (`orphans`). Both lists empty is the healthy state.
 */
export function extractDictionaries(harness: string, extraSources?: readonly ExtraSource[]): Promise<{
  namespaces: Record<string, ExtractedNamespace>
  unreadable: string[]
  orphans: string[]
}>

/**
 * Read one named dictionary literal out of a source file.
 * @param file - path to the .ts file.
 * @param name - the exported const's name.
 * @returns key to text, empty when the file declares no such literal.
 */
export function readOwnDictionary(file: string, name: string): Promise<Record<string, string>>
