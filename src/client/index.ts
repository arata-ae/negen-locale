/**
 * Browser half: a language pack over the built-in locale plugin.
 *
 * This package widens the roster and fills in the text. It does not provide
 * the `locale` service, install a locale face, or register a Language row: the
 * built-in plugin owns all three, and the row it already registers renders
 * whatever the catalog carries — `addLanguage` is the extension point upstream
 * documents for exactly this. See UPSTREAM.md for why replacing the plugin
 * stopped being possible at 0.2.0.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the `ctx.locale` Context merge and the registration types
// from the built-in plugin. Nothing here imports it at runtime — the service
// is the seam, and the row this pack extends already provides it.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { BACKFILL } from './dictionaries.ts'
import { installFontFallback } from './fonts.ts'
import { LANGUAGES } from './languages.ts'

/** The one service this pack needs: the built-in locale registry. */
export const inject = ['locale']

/** Cordis plugin name. */
export const name = 'negen-locale'

/**
 * Widen the roster, fill in the text for the languages it added, and repair
 * the theme's font stacks.
 * @param ctx - client cordis context carrying the built-in locale service.
 */
export function apply(ctx: ClientContext): void {
  // The roster comes first. A dictionary registered for a locale the catalog
  // does not carry is unreachable — the lookup chain walks the catalog — and
  // the Language row renders that same catalog, so an unregistered language is
  // invisible twice over. An id the composition already carries is skipped
  // rather than thrown on: `addLanguage` refuses a second occupant, and a
  // harness build that starts shipping one of these languages must not take
  // this plugin down with it.
  const present = new Set(ctx.locale.getSnapshot().locales.map(locale => locale.id))
  for (const language of LANGUAGES) {
    if (present.has(language.id)) continue
    ctx.effect(() => ctx.locale.addLanguage(language), `negen-locale: ${language.id}`)
  }
  // Then the text. Upstream's own packages register `{ zh, en }` for their
  // namespaces and know nothing about this package, so every Japanese, Korean
  // and Traditional Chinese string for them arrives here instead. The
  // (namespace, locale) pair is the occupancy key: the built-in registers zh
  // and en itself, and these three are free on every namespace — including the
  // two the built-in declares, whose `common` and `settings.locale` rows are
  // in this corpus like any other.
  for (const [locale, namespaces] of Object.entries(BACKFILL)) {
    for (const [ns, entries] of Object.entries(namespaces)) {
      ctx.effect(() => ctx.locale.register(ns, locale, entries), `negen-locale: ${locale}/${ns}`)
    }
  }
  // The attribute the theme reads for font fallback only helps once the theme
  // stops naming a Simplified Chinese family outright; see fonts.ts.
  ctx.effect(() => installFontFallback(), 'negen-locale: font fallback')
}
