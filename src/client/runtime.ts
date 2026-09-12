/**
 * The locale service itself: a dictionary registry, a preference, and the
 * lookup chain that joins them.
 *
 * Split out of the plugin body so the chain can be exercised against a stub
 * context, with no DOM and no React in the import graph — upstream keeps this
 * class in its client entry beside a TSX row, where importing it drags the
 * whole render stack along.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { LocaleDictOf, LocaleNamespaceMap, Translate, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import {
  CONVERT_FALLBACK, FALLBACK_LOCALE, LOCALES, LOCALE_PREFERENCE_FIELD, isShipped,
  type LocaleDefinition, type LocaleId, type LocaleSettings,
} from '../locale-settings.ts'
import { convertZhTw } from './convert.ts'
import { resolveInitialLocale } from './detect.ts'

/** Shared namespace for shell-level texts. */
export const COMMON_NS = 'common'

/** Locale dictionary: flat key to template string ({name} placeholders). */
export type LocaleDict = Record<string, string>

/**
 * Dictionaries handed to the object form of {@link LocaleRuntime.register}.
 *
 * English is required and everything else optional, which is wider than the
 * built-in plugin's all-locales-required shape and deliberately so: every
 * upstream client package calls `register(ns, { zh, en })` and would fail an
 * all-five requirement. English is the one rung the fallback chain always
 * needs, so it is the one this insists on.
 */
export type LocaleDictSet<N extends keyof LocaleNamespaceMap & string>
  = Partial<Record<LocaleId, LocaleDictOf<N>>> & { en: LocaleDictOf<N> }

/** Immutable locale state published on every change. */
export interface LocaleSnapshot {
  /** Active locale id. */
  active: LocaleId
  /** Selectable locales in display order. */
  locales: readonly LocaleDefinition[]
  /** Monotonic change counter (registry or active changes). */
  revision: number
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    locale: LocaleRuntime
  }
  interface Events {
    /**
     * The active locale switched. Dictionary registrations do NOT emit this
     * event (listeners may re-register slots in response, and boot registers
     * one namespace per package); continuous render refresh rides the
     * LocaleFace revision instead.
     * @param snapshot - Current immutable locale snapshot.
     * @mode emit
     */
    'locale/change'(snapshot: LocaleSnapshot): void
  }
}

/**
 * Dictionary registry plus locale preference. Lookup chain per key: the
 * entry's namespace in the active locale -> that namespace's convertible
 * source, character-converted (zh-TW only) -> that namespace's en fallback
 * -> the shared common namespace, same three rungs -> the key itself
 * (missing text stays visible, fail loud in the UI rather than blank).
 *
 * Reads go through {@link getLocale}; writes only through {@link setLocale};
 * continuous sync through the `locale/change` event, or through the
 * LocaleFace getSnapshot/subscribe pair the render machinery consumes
 * (installed via `ctx.slots.installLocale`).
 */
export class LocaleRuntime {
  private dicts = new Map<string, Map<string, LocaleDict>>()
  private bound = new Map<string, Translate>()
  private snapshot: LocaleSnapshot
  private listeners = new Set<() => void>()
  private readonly ctx: Context
  private readonly host: SettingsScope<LocaleSettings> | undefined
  /** Browser-derived locale standing wherever no explicit Host selection does. */
  private readonly provisional: LocaleId

  /**
   * @param ctx - owning context (change events are emitted on it; the scope
   * listener is released through ctx.effect on dispose).
   * @param host - durable preference scope owned by the providing plugin;
   * absent compositions (standalone dictionary registries) stay process-local.
   */
  constructor(ctx: Context, host?: SettingsScope<LocaleSettings>) {
    this.ctx = ctx
    this.host = host
    this.provisional = resolveInitialLocale()
    this.snapshot = Object.freeze({ active: this.provisional, locales: LOCALES, revision: 0 })
    if (host !== undefined) {
      ctx.effect(() => host.subscribe(() => { this.adopt(host) }), 'locale: settings scope adoption')
      this.adopt(host)
    }
  }

  /**
   * Read the current immutable locale snapshot.
   * @returns the current snapshot (stable reference until the next change).
   */
  getLocale(): LocaleSnapshot {
    return this.snapshot
  }

  /**
   * LocaleFace getSnapshot: the current snapshot (carries `revision`; stable
   * reference between changes, uSES-safe).
   * @returns the current snapshot.
   */
  getSnapshot(): LocaleSnapshot {
    return this.snapshot
  }

  /**
   * LocaleFace subscribe: notified on every snapshot change (locale switch
   * or dictionary registration — registrations bump the revision so already
   * rendered outlets pick up late-arriving dictionaries).
   * @param fn - change callback.
   * @returns unsubscribe.
   */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  /**
   * Switch the active locale — the only user preference write entry.
   *
   * The durable write happens even when the id already matches the active
   * locale, because the active value may be a provisional browser-derived or
   * fallback resolution that nothing has stored yet. Picking the language
   * already on screen is still an explicit choice, and it must survive a
   * different browser sharing the same DSH home. Only the render notification
   * is conditional: republishing an unchanged locale would churn every
   * subscriber for nothing.
   * @param id - a registered locale id; unknown ids throw.
   */
  setLocale(id: string): void {
    const match = this.snapshot.locales.find(l => l.id === id)
    if (match === undefined) throw new Error(`locale "${id}" is not registered`)
    if (this.snapshot.active !== match.id) this.publish(match.id, true)
    void this.host?.set(LOCALE_PREFERENCE_FIELD, match.id)
  }

  /**
   * Adopt the scope's accepted durable selection without writing it back; an
   * absent selection returns to the browser-derived locale.
   *
   * A stored id this roster does not ship is treated as absent rather than
   * adopted. The document key is shared with the built-in plugin, so it can
   * hold a language this fork dropped; adopting it would leave the Language
   * row with nothing selected and every lookup falling to English, with no
   * way back except editing the file. It is left on disk untouched, so
   * restoring the language restores the selection.
   * @param host - the constructor-narrowed scope driving this adoption.
   */
  private adopt(host: SettingsScope<LocaleSettings>): void {
    const section = host.getSnapshot().value
    if (section === undefined) return
    const stored = section.preference
    const target = isShipped(stored) ? stored : this.provisional
    if (this.snapshot.active === target) return
    this.publish(target, true)
  }

  /**
   * Register a declared namespace's dictionaries, several locales in one
   * call. Each dictionary is checked against the namespace's
   * {@link LocaleNamespaceMap} key union (a missing or extra key is a compile
   * error). Duplicate (ns, locale) throws (single occupant; a namespace's
   * texts have one owner). Registration bumps the revision so mounted outlets
   * pick up late-arriving dictionaries.
   * @param ns - a namespace merged into LocaleNamespaceMap.
   * @param dicts - dictionaries keyed by locale id; `en` required.
   * @returns disposer removing every locale registered by this call (idempotent).
   */
  register<N extends keyof LocaleNamespaceMap & string>(ns: N, dicts: LocaleDictSet<N>): () => void
  /**
   * Single-locale untyped form for namespaces outside the merge table
   * (dynamic composition, back-filled upstream namespaces, tests).
   * @param ns - namespace.
   * @param locale - locale tag.
   * @param dict - dictionary.
   * @returns disposer (idempotent).
   */
  register(ns: string, locale: string, dict: LocaleDict): () => void
  register(ns: string, localeOrDicts: string | Record<string, LocaleDict>, dict?: LocaleDict): () => void {
    const pairs: [string, LocaleDict][] = typeof localeOrDicts === 'string'
      // Overload guarantees dict on the single-locale arm.
      ? [[localeOrDicts, dict as LocaleDict]]
      : Object.entries(localeOrDicts)
    let locales = this.dicts.get(ns)
    if (!locales) {
      locales = new Map()
      this.dicts.set(ns, locales)
    }
    for (const [locale] of pairs) {
      if (locales.has(locale)) throw new Error(`locale namespace "${ns}" already has locale "${locale}"`)
    }
    for (const [locale, entries] of pairs) locales.set(locale, entries)
    this.publish(this.snapshot.active, false)
    return () => {
      const owner = this.dicts.get(ns)
      if (!owner) return
      let removed = false
      for (const [locale, entries] of pairs) {
        if (owner.get(locale) === entries) {
          owner.delete(locale)
          removed = true
        }
      }
      if (removed) this.publish(this.snapshot.active, false)
    }
  }

  /**
   * Bind a declared namespace to a translate function typed to its
   * dictionary key union (plus the shared common vocabulary) — the same key
   * domain the framework-injected `t` seat carries. The returned reference
   * is stable per namespace (repeat binds return the same function), so it
   * can ride inject surfaces without breaking memoization.
   * @param ns - a namespace merged into LocaleNamespaceMap.
   * @returns the typed translate function (reads the active locale at call time).
   */
  bind<N extends keyof LocaleNamespaceMap & string>(ns: N): TranslateNS<N>
  /**
   * Untyped form for namespaces outside the merge table (dynamic
   * composition, tests).
   * @param ns - namespace.
   * @returns the translate function.
   */
  bind(ns: string): Translate
  bind(ns: string): Translate {
    let t = this.bound.get(ns)
    if (!t) {
      t = (key, params) => this.translate(ns, key, params)
      this.bound.set(ns, t)
      return t
    }
    return t
  }

  private translate(ns: string, key: string, params?: Record<string, unknown>): string {
    const template = this.lookup(ns, key)
      ?? (ns !== COMMON_NS ? this.lookup(COMMON_NS, key) : undefined)
      ?? key
    if (!params) return template
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in params ? String(params[name]) : match)
  }

  /**
   * Resolve one key within one namespace, walking the locale rungs.
   *
   * The middle rung is the fork's addition: a zh-TW read with no curated
   * string falls to the Simplified value and converts it, which beats
   * dropping straight to English for a reader who asked for Chinese. Only
   * pairs listed in CONVERT_FALLBACK have such a rung, and a curated string
   * always wins over a converted one.
   */
  private lookup(ns: string, key: string): string | undefined {
    const locales = this.dicts.get(ns)
    if (locales === undefined) return undefined
    const active = this.snapshot.active
    const curated = locales.get(active)?.[key]
    if (curated !== undefined) return curated
    const convertible = CONVERT_FALLBACK[active]
    if (convertible !== undefined) {
      const source = locales.get(convertible)?.[key]
      if (source !== undefined) return convertZhTw(source)
    }
    return locales.get(FALLBACK_LOCALE)?.[key]
  }

  /**
   * Advance the snapshot revision and notify LocaleFace subscribers (render
   * refresh). Only an active-locale switch additionally emits
   * `locale/change` — dictionary registrations stay off the event so
   * registration-heavy boot cannot storm event listeners (which may
   * re-register slots in response).
   */
  private publish(active: LocaleId, localeChanged: boolean): void {
    this.snapshot = Object.freeze({
      active,
      locales: this.snapshot.locales,
      revision: this.snapshot.revision + 1,
    })
    if (localeChanged) this.ctx.emit('locale/change', this.snapshot)
    for (const fn of [...this.listeners]) {
      try {
        fn()
      } catch (error) {
        // One throwing subscriber must not strand the rest on a stale
        // revision (outlets would keep the previous language).
        console.error('locale subscriber crashed:', error)
      }
    }
  }
}
