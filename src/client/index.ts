/**
 * Browser-side locale registry, forked from `@deepseek-ai/dsh-client-locale`
 * and widened from two locales to five. See UPSTREAM.md for the fork point
 * and the full list of deviations.
 *
 * The plugin also registers the Language preference row into the settings
 * General section — the locale feature owns its own settings surface, which
 * is why replacing the built-in plugin means replacing that row too.
 */
/* oxlint-disable typescript/no-redundant-type-constituents --
 * `keyof LocaleNamespaceMap & string` is the declare-merge key pattern: in
 * THIS unit the map holds only this package's own merges, but consumers merge
 * more namespaces in and the intersection keeps them string-typed. */
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: the ctx.settingsScope Context merge and the settings slot types.
// Cross-plugin collaboration goes through the service, never a value import.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import {
  DOCUMENT_LANGUAGE, LOCALE_SETTINGS_NAMESPACE, type LocaleId, type LocaleSettings,
} from '../locale-settings.ts'
import { en, ja, ko, zh, zhTW, type CommonKey } from '../locales/index.ts'
import {
  en as settingsEn, ja as settingsJa, ko as settingsKo, zh as settingsZh,
  zhTW as settingsZhTW, type SettingsLocaleKey,
} from '../locales/settings.ts'
import { COMMON_NS, LocaleRuntime, type LocaleSnapshot } from './runtime.ts'
import { BACKFILL } from './dictionaries.ts'
import { installFontFallback } from './fonts.ts'
import { installStyles } from './styles.ts'
import type { LanguageRowInjected } from './LanguageRow.tsx'
import { LanguageRow } from './LanguageRow.tsx'
import { createLanguageRowStore } from './settings-store.ts'

export type { LanguageRowComponentProps, LanguageRowInjected } from './LanguageRow.tsx'
export type { LanguageOptionRow, LanguageRowState } from './settings-store.ts'
export type { CommonKey } from '../locales/index.ts'
export {
  CONVERT_FALLBACK, DOCUMENT_LANGUAGE, FALLBACK_LOCALE, LOCALES, LOCALE_IDS,
  type LocaleDefinition, type LocaleId, type LocaleSettings,
} from '../locale-settings.ts'
export { convertZhTw, CHAR_TABLE_SIZE } from './convert.ts'
export { FONT_CSS, installFontFallback } from './fonts.ts'
export { matchTag } from './detect.ts'
export { COMMON_NS, LocaleRuntime, type LocaleDict, type LocaleDictSet, type LocaleSnapshot } from './runtime.ts'

// The translate currency lives in ui-slots (the render machinery synthesizes
// the seat); re-exported here so dictionary owners import one package.
export type { Translate, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Shared cross-feature vocabulary, consulted by the lookup chain after the entry's own namespace misses. */
    common: CommonKey
    /** This feature's own settings-row copy (the Language row). */
    'settings.locale': SettingsLocaleKey
  }
}

/** Namespace owning this feature's settings-row copy. */
export const SETTINGS_NS = 'settings.locale'

/**
 * Point `<html lang>` at the active locale. Called on every locale change,
 * so the attribute tracks the UI instead of standing at whatever the served
 * markup happened to declare.
 * @param active - the active locale id.
 */
function syncDocumentLanguage(active: LocaleId): void {
  // Non-browser runs (node boots of the client tree) have no document.
  if (typeof document === 'undefined') return
  document.documentElement.lang = DOCUMENT_LANGUAGE[active]
}

/** Required services: slot registration plus the settings transport. */
export const inject = ['slots', 'connection', 'remote', 'settingsScope']

/** Cordis plugin name. */
export const name = 'negen-locale'

/**
 * Client plugin body: provide the locale service with base dictionaries,
 * back-fill the CJK dictionaries for upstream's own namespaces, and register
 * the feature-owned Language preference row into the General section's item
 * slot (a feature owns its settings surface).
 * @param ctx - client cordis context.
 */
export function apply(ctx: ClientContext): void {
  const host = ctx.settingsScope.bind<LocaleSettings>({ namespace: LOCALE_SETTINGS_NAMESPACE })
  const locale = new LocaleRuntime(ctx, host)
  locale.register(COMMON_NS, { zh, 'zh-TW': zhTW, ja, ko, en })
  locale.register(SETTINGS_NS, {
    'zh': settingsZh,
    'zh-TW': settingsZhTW,
    'ja': settingsJa,
    'ko': settingsKo,
    'en': settingsEn,
  })

  // Upstream packages register only { zh, en } for their own namespaces, so
  // every CJK string for them arrives here instead. The untyped single-locale
  // form is the seam that makes this possible without touching their code:
  // (ns, locale) is the occupancy key, and 'ja' on someone else's namespace
  // is unoccupied. Registration order does not matter — this plugin is
  // immediately-tier and runs before the packages it back-fills, and a later
  // { zh, en } registration for the same namespace collides with neither.
  for (const [localeId, namespaces] of Object.entries(BACKFILL)) {
    for (const [ns, entries] of Object.entries(namespaces)) {
      ctx.effect(
        () => locale.register(ns, localeId, entries),
        `negen-locale: ${localeId}/${ns}`,
      )
    }
  }

  ctx.provide('locale', locale)
  // The service IS the LocaleFace (bind + getSnapshot/subscribe): install it
  // so the render machinery can synthesize the `t` standard seat.
  ctx.slots.installLocale(locale)

  const store = createLanguageRowStore()
  let bound: BoundActions<typeof store> | undefined
  const sync = (snapshot: LocaleSnapshot): void => {
    syncDocumentLanguage(snapshot.active)
    bound?.sync(
      snapshot.active,
      snapshot.locales.map(l => ({ id: l.id, label: l.label })),
      snapshot.revision,
    )
  }
  ctx.on('locale/change', sync)
  // The served markup declares one language; the resolved locale may differ
  // (browser detection, or a stored preference adopted after activation), so
  // state it once at activation rather than waiting for the first change.
  syncDocumentLanguage(locale.getLocale().active)
  // The attribute only steers font fallback once the theme stops naming a
  // Simplified Chinese family outright; see fonts.ts.
  ctx.effect(() => installFontFallback(), 'negen-locale: font fallback')
  ctx.effect(() => installStyles(), 'negen-locale: language row styles')
  const injected = (actions: BoundActions<typeof store>): LanguageRowInjected => {
    bound = actions
    // Re-sync from the getter so no event is lost between registration and
    // first render (the store's revision guard drops stale duplicates).
    sync(locale.getLocale())
    return {
      setLocale: (id) => { locale.setLocale(id) },
    }
  }
  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'language',
    order: 0,
    store,
    locale: SETTINGS_NS,
    inject: injected,
  }, LanguageRow))
}
