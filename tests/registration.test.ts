import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import backfill from '../src/client/backfill.generated.json' with { type: 'json' }
import { apply } from '../src/client/index.ts'
import { LANGUAGES } from '../src/client/languages.ts'

/** Locales the built-in plugin ships. It registers both for its own namespaces. */
const BUILT_IN = ['zh', 'en']

/** The tag rule the built-in service validates ids against. */
const LOCALE_ID_PATTERN = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u

/**
 * Stand-in for the built-in locale service: its roster, its two refusals (a
 * second occupant of a (namespace, locale) pair, and a fallback that is not
 * registered), and the effect registration `apply` needs.
 */
function stubLocale() {
  const roster = new Set(BUILT_IN)
  const occupied = new Set<string>()
  const labels: string[] = []
  const locale = {
    getSnapshot: () => ({
      active: 'en',
      locales: [...roster].map(id => ({ id, label: id })),
      revision: 0,
    }),
    addLanguage: ({ id, label, fallback }: { id: string, label: string, fallback: string }) => {
      assert.match(id, LOCALE_ID_PATTERN, `${id} is not a tag the service accepts`)
      assert.ok(label.trim() !== '', `${id} needs a label`)
      assert.equal(roster.has(id), false, `${id} is already in the roster`)
      assert.ok(roster.has(fallback), `${id} falls back to unregistered "${fallback}"`)
      roster.add(id)
      return () => { roster.delete(id) }
    },
    register: (ns: string, localeId: string) => {
      const key = `${ns}\u0000${localeId}`
      assert.equal(occupied.has(key), false, `${ns}/${localeId} already has an occupant`)
      occupied.add(key)
      return () => { occupied.delete(key) }
    },
  }
  const ctx = {
    locale,
    effect: (fn: () => () => void, label?: string) => {
      labels.push(label ?? '')
      return fn()
    },
  }
  return { ctx, roster, occupied, labels }
}

test('apply widens the roster to five languages and back-fills without a collision', () => {
  // The failure this guards is invisible everywhere else: a throw inside plugin
  // activation drops the whole entry, and the UI keeps the built-in roster with
  // no error anyone can see.
  const { ctx, roster, labels } = stubLocale()
  apply(ctx as never)

  assert.deepEqual([...roster], ['zh', 'en', 'zh-TW', 'ja', 'ko'])
  assert.ok(labels.some(label => label === 'negen-locale: font fallback'), 'the font repair must be installed')

  const expected = Object.entries(backfill)
    .reduce((n, [, namespaces]) => n + Object.keys(namespaces).length, 0)
  assert.equal(labels.filter(label => label.startsWith('negen-locale: ') && label.includes('/')).length, expected)
})

test('a language the composition already carries is skipped rather than fatal', () => {
  // addLanguage refuses a second occupant. A future harness build that starts
  // shipping one of these three must not take this plugin down with it.
  const { ctx, roster } = stubLocale()
  roster.add('ja')
  apply(ctx as never)
  assert.deepEqual([...roster], ['zh', 'en', 'ja', 'zh-TW', 'ko'])
})

test('the corpus never claims a locale the built-in plugin owns', () => {
  // zh and en are registered by upstream packages for their own namespaces, so
  // a corpus file for either is a guaranteed "already has locale" at boot.
  for (const locale of Object.keys(backfill)) {
    assert.equal(BUILT_IN.includes(locale), false, `dict/ carries ${locale}`)
  }
})

test('every corpus locale is one this pack adds to the roster', () => {
  const added = new Set(LANGUAGES.map(language => language.id))
  for (const locale of Object.keys(backfill)) {
    assert.ok(added.has(locale), `dict/ carries ${locale}, which this pack never adds`)
  }
})

test('the corpus registers each (namespace, locale) pair exactly once', () => {
  const seen = new Set<string>()
  for (const [locale, namespaces] of Object.entries(backfill)) {
    for (const ns of Object.keys(namespaces)) {
      const key = `${ns}\u0000${locale}`
      assert.equal(seen.has(key), false, `${ns}/${locale} appears twice`)
      seen.add(key)
    }
  }
})
