/**
 * Resolving the locale a browser is asking for.
 *
 * Split out of the plugin body so it can be exercised without a DOM, a cordis
 * context, or React — upstream keeps these two functions inside its client
 * entry, where the only way to reach them is to boot the whole plugin.
 */

import { FALLBACK_LOCALE, LOCALE_IDS, type LocaleId } from '../locale-settings.ts'

/**
 * The browser's own language wins over {@link FALLBACK_LOCALE}; an explicit
 * Host preference may replace this provisional value after plugin activation.
 */
/**
 * @returns the browser's first shipped language, or {@link FALLBACK_LOCALE}.
 */
export function resolveInitialLocale(): LocaleId {
  return detectBrowserLocale() ?? FALLBACK_LOCALE
}

/**
 * The first shipped locale the browser asks for. Module-private: the roster
 * outside this file is reached through {@link resolveInitialLocale}, which is
 * the only caller that has a fallback to apply.
 *
 * Matching on the primary subtag alone — which is what the built-in plugin
 * does — cannot separate the two Chinese variants: `zh-Hant-TW` and
 * `zh-Hans-CN` both reduce to `zh`. So Chinese is resolved by script and
 * region first, and everything else still lands on its language
 * (`en-GB` -> en, `ja-JP` -> ja).
 *
 * `window` is the browser test, not `navigator`: Node exposes a global
 * `navigator` reporting the machine's own language, which would otherwise
 * decide the locale for non-browser runs. `navigator.language` trails the
 * ordered `languages` list and covers its absence on hosts exposing only the
 * single tag.
 */
function detectBrowserLocale(): LocaleId | undefined {
  if (typeof window === 'undefined') return undefined
  /* oxlint-disable-next-line typescript/no-unnecessary-condition --
   * The DOM lib types `languages` as always present; embedders and older
   * WebViews ship a Navigator without it, and spreading undefined would
   * throw at boot. */
  for (const tag of [...(navigator.languages ?? []), navigator.language]) {
    const match = matchTag(tag)
    if (match !== undefined) return match
  }
  return undefined
}

/** Traditional-Chinese regions, for a tag that names no script. */
const TRADITIONAL_REGIONS = new Set(['tw', 'hk', 'mo'])

/**
 * Resolve one BCP 47 tag to a shipped locale id.
 * @param tag - a browser language tag, any casing.
 * @returns the shipped id, or undefined when nothing matches.
 */
export function matchTag(tag: string): LocaleId | undefined {
  const parts = tag.toLowerCase().split('-')
  const primary = parts[0]
  if (primary === 'zh') {
    if (parts.includes('hant')) return 'zh-TW'
    if (parts.includes('hans')) return 'zh'
    return parts.some(part => TRADITIONAL_REGIONS.has(part)) ? 'zh-TW' : 'zh'
  }
  return LOCALE_IDS.find(id => id.toLowerCase().split('-')[0] === primary)
}
