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

/**
 * Extract every namespace's zh and en dictionaries from a harness checkout.
 * @param harness - checkout root.
 * @returns namespaces by name, plus what the scanner could not read
 * (`unreadable`) and namespaces that declared a key type no dictionary
 * carries (`orphans`). Both lists empty is the healthy state.
 */
export function extractDictionaries(harness: string): Promise<{
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
