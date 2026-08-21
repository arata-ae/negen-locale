import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import backfill from '../src/client/backfill.generated.json' with { type: 'json' }
import { LOCALE_IDS } from '../src/locale-settings.ts'
import { COMMON_NS, LocaleRuntime } from '../src/client/runtime.ts'
import { en, ja, ko, zh, zhTW } from '../src/locales/index.ts'
import {
  en as settingsEn, ja as settingsJa, ko as settingsKo, zh as settingsZh, zhTW as settingsZhTW,
} from '../src/locales/settings.ts'

const SETTINGS_NS = 'settings.locale'

/** The two members LocaleRuntime touches on its context. */
function stubContext() {
  return { emit: () => {}, effect: (fn: () => () => void) => fn() } as never
}

test('every registration the plugin makes lands on a free (namespace, locale)', () => {
  // A second occupant throws, and the throw happens inside plugin activation:
  // the loader drops the whole entry and the UI silently keeps the built-in
  // locale plugin's roster. Booting the real registration set is the only
  // check that sees it — the build's own guard covers just the dict/ half.
  const locale = new LocaleRuntime(stubContext())
  locale.register(COMMON_NS, { zh, 'zh-TW': zhTW, ja, ko, en })
  locale.register(SETTINGS_NS, {
    'zh': settingsZh,
    'zh-TW': settingsZhTW,
    'ja': settingsJa,
    'ko': settingsKo,
    'en': settingsEn,
  })
  for (const [localeId, namespaces] of Object.entries(backfill)) {
    for (const [ns, entries] of Object.entries(namespaces)) {
      locale.register(ns, localeId, entries)
    }
  }
})

test('the back-fill corpus never carries a namespace src/locales/ owns', () => {
  // The same collision seen from the data side, so a stray dict/ file is
  // named rather than surfacing as "already has locale" at boot.
  for (const [localeId, namespaces] of Object.entries(backfill)) {
    for (const ns of [COMMON_NS, SETTINGS_NS]) {
      assert.equal(
        Object.hasOwn(namespaces, ns), false,
        `dict/${localeId}/${ns}.json duplicates a registration from src/locales/`,
      )
    }
  }
})

test('the back-fill corpus only names locales this roster ships', () => {
  for (const localeId of Object.keys(backfill)) {
    assert.ok(
      (LOCALE_IDS as readonly string[]).includes(localeId),
      `dict/ carries "${localeId}", which setLocale would reject`,
    )
  }
})
