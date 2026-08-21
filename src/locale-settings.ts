/**
 * Locale identity: the roster, the settings coordinates, and the durable
 * shape. Deliberately free of any schema import so the browser bundle can
 * take the constants without pulling schemastery in behind them — the schema
 * itself lives in `settings-schema.ts`, which only the host half loads.
 */

/** Settings namespace, unchanged from the built-in plugin so a preference stored before this fork still resolves. */
export const LOCALE_SETTINGS_NAMESPACE = 'locale'

/** Field carrying an explicit locale selection; absence delegates to the browser. */
export const LOCALE_PREFERENCE_FIELD = 'preference'

/**
 * Locale identifiers shipped by this plugin. `zh` and `en` keep the built-in
 * plugin's meaning (`zh` is Simplified, mainland); the other three are what
 * this fork exists to add. Widening a union is backward compatible, so every
 * preference the built-in plugin ever wrote still validates.
 */
export const LOCALE_IDS = ['zh', 'zh-TW', 'ja', 'ko', 'en'] as const

/** Shipped locale identifier. */
export type LocaleId = typeof LOCALE_IDS[number]

/** Durable locale section shared by the host schema and the browser scope. */
export interface LocaleSettings {
  /**
   * Explicit locale selection; absence delegates to the browser. Typed as a
   * plain string because the document key predates this roster: a home that
   * ran the harness in a language this fork does not ship has that id stored,
   * and it must survive being read. {@link isShipped} narrows it.
   */
  preference?: string
}

/**
 * Whether a stored preference names a locale this roster ships.
 * @param id - a durable preference value.
 * @returns true when the id is selectable.
 */
export function isShipped(id: string | undefined): id is LocaleId {
  return LOCALE_IDS.some(shipped => shipped === id)
}

/** One selectable locale: id plus its self-described display name. */
export interface LocaleDefinition {
  /** Locale id (persisted; the setLocale argument). */
  id: LocaleId
  /** Display name in its own language. */
  label: string
}

/**
 * The shipped roster, in display order. Chinese variants sit together, then
 * the other CJK languages, then English last — the same tail position the
 * built-in plugin gave it.
 */
export const LOCALES: readonly LocaleDefinition[] = Object.freeze([
  { id: 'zh', label: '简体中文' },
  { id: 'zh-TW', label: '繁體中文' },
  { id: 'ja', label: '日本語' },
  { id: 'ko', label: '한국어' },
  { id: 'en', label: 'English' },
])

/**
 * English is both the locale the UI opens in when the browser names no
 * shipped language, and the dictionary consulted after the active locale
 * misses a key. Upstream packages register `{ zh, en }` and nothing else, so
 * en is the only rung guaranteed to be complete for every namespace.
 */
export const FALLBACK_LOCALE: LocaleId = 'en'

/**
 * Traditional Chinese falls back through Simplified before English: the two
 * share a source text, so a character-converted zh string beats an untranslated
 * English one. No other pair is convertible, so no other locale gets a rung here.
 */
export const CONVERT_FALLBACK: Partial<Record<LocaleId, LocaleId>> = { 'zh-TW': 'zh' }

/**
 * `<html lang>` per shipped locale. The locale id is this plugin's own
 * vocabulary; the document attribute wants a BCP 47 tag, which assistive
 * technology and browser features read to pick pronunciation, font fallback
 * and spell check. Bare `zh` leaves the script ambiguous, so both Chinese
 * entries name the variant they actually are.
 */
export const DOCUMENT_LANGUAGE: Record<LocaleId, string> = {
  'zh': 'zh-CN',
  'zh-TW': 'zh-TW',
  'ja': 'ja',
  'ko': 'ko',
  'en': 'en',
}
