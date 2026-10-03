/**
 * The languages this pack adds to the roster the built-in plugin owns.
 *
 * Each label is written in the language it names, which is what the built-in's
 * Language row renders. `fallback` is the id consulted when this language has
 * no entry for a key: zh-TW reads Chinese before English, because the two
 * share a source text, and the other two read English.
 *
 * A fallback is an id and not a converter — upstream's `addLanguage` takes
 * nothing else — so a zh-TW key with no curated value renders the *Simplified*
 * string rather than a converted one. That is answered in the corpus instead
 * of at runtime: every key the pinned upstream ships has a curated Traditional
 * value. See UPSTREAM.md for the one case it does not cover.
 */

import type { LanguageRegistration } from '@deepseek-ai/dsh-client-locale/client'

/** The three languages, in the order the roster shows them. */
export const LANGUAGES: readonly LanguageRegistration[] = Object.freeze([
  { id: 'zh-TW', label: '繁體中文', fallback: 'zh' },
  { id: 'ja', label: '日本語', fallback: 'en' },
  { id: 'ko', label: '한국어', fallback: 'en' },
])
