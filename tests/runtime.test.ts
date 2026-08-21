import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import type { Context } from '@deepseek-ai/cordis'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import { LOCALES, type LocaleSettings } from '../src/locale-settings.ts'
import { LocaleRuntime } from '../src/client/runtime.ts'

/** The two members LocaleRuntime touches on its context, and nothing else. */
function stubContext() {
  const emitted: unknown[] = []
  const ctx = {
    emit: (_event: string, payload: unknown) => { emitted.push(payload) },
    effect: (fn: () => () => void) => fn(),
  } as unknown as Context
  return { ctx, emitted }
}

/** A runtime with no durable scope: process-local, opens on the fallback locale. */
function runtime() {
  return new LocaleRuntime(stubContext().ctx)
}

/** The three members LocaleRuntime touches on a settings scope. */
function stubScope(value: LocaleSettings | undefined) {
  const writes: unknown[] = []
  const scope = {
    getSnapshot: () => ({ value }),
    subscribe: () => () => {},
    set: (field: string, next: unknown) => { writes.push([field, next]) },
  } as unknown as SettingsScope<LocaleSettings>
  return { scope, writes }
}

test('the roster carries all five shipped locales', () => {
  const snapshot = runtime().getLocale()
  assert.deepEqual(snapshot.locales.map(l => l.id), ['zh', 'zh-TW', 'ja', 'ko', 'en'])
  assert.equal(snapshot.locales.length, LOCALES.length)
})

test('a curated string wins over every fallback', () => {
  const locale = runtime()
  locale.register('ns', 'en', { key: 'English' })
  locale.register('ns', 'zh', { key: '关闭' })
  locale.register('ns', 'zh-TW', { key: '關閉視窗' })
  locale.setLocale('zh-TW')
  assert.equal(locale.bind('ns')('key'), '關閉視窗')
})

test('zh-TW falls through Simplified, character-converted, before English', () => {
  const locale = runtime()
  locale.register('ns', 'en', { key: 'Close' })
  locale.register('ns', 'zh', { key: '关闭' })
  locale.setLocale('zh-TW')
  // No curated zh-TW string exists, so the Simplified one is converted rather
  // than dropping a Chinese reader onto English.
  assert.equal(locale.bind('ns')('key'), '關閉')
})

test('zh-TW falls through to English when there is no Simplified string either', () => {
  const locale = runtime()
  locale.register('ns', 'en', { key: 'Close' })
  locale.setLocale('zh-TW')
  assert.equal(locale.bind('ns')('key'), 'Close')
})

test('no locale other than zh-TW converts', () => {
  const locale = runtime()
  locale.register('ns', 'en', { key: 'Close' })
  locale.register('ns', 'zh', { key: '关闭' })
  for (const id of ['ja', 'ko']) {
    locale.setLocale(id)
    // Simplified Chinese is not a better fallback than English for these.
    assert.equal(locale.bind('ns')('key'), 'Close', `${id} should fall back to English`)
  }
})

test('zh reads the dictionary every upstream package already ships', () => {
  const locale = runtime()
  // Nothing in this package back-fills zh: upstream registers it itself.
  locale.register('ns', 'en', { key: 'Close' })
  locale.register('ns', 'zh', { key: '关闭' })
  locale.setLocale('zh')
  assert.equal(locale.bind('ns')('key'), '关闭')
})

test('the shared common namespace is consulted after the entry namespace misses', () => {
  const locale = runtime()
  locale.register('common', 'en', { cancel: 'Cancel' })
  locale.register('common', 'ja', { cancel: 'キャンセル' })
  locale.register('ns', 'en', { other: 'Other' })
  locale.setLocale('ja')
  assert.equal(locale.bind('ns')('cancel'), 'キャンセル')
})

test('a key nobody has stays visible as itself', () => {
  const locale = runtime()
  locale.register('ns', 'en', { key: 'English' })
  assert.equal(locale.bind('ns')('absent'), 'absent')
})

test('placeholders interpolate, and an unmatched one is left alone', () => {
  const locale = runtime()
  locale.register('ns', 'en', { greet: 'Open {name}', both: '{a} and {b}' })
  const t = locale.bind('ns')
  assert.equal(t('greet', { name: 'notes.md' }), 'Open notes.md')
  assert.equal(t('both', { a: 'one' }), 'one and {b}')
})

test('every shipped locale is selectable and an unshipped one throws', () => {
  const locale = runtime()
  for (const { id } of LOCALES) {
    locale.setLocale(id)
    assert.equal(locale.getLocale().active, id)
  }
  assert.throws(() => { locale.setLocale('fr') }, /not registered/)
})

test('the back-fill seam: a second locale may join a namespace someone else owns', () => {
  const locale = runtime()
  // This is exactly what upstream packages do for their own namespaces. The
  // cast stands in for their declare-merge: 'conversation' is a declared
  // namespace inside ui-conversation's program, not inside this one.
  const register = locale.register.bind(locale) as (ns: string, dicts: unknown) => () => void
  register('conversation', { zh: { key: '停止' }, en: { key: 'Stop' } })
  // ...and this is how this plugin adds the locales they never ship.
  locale.register('conversation', 'ja', { key: '停止' })
  locale.setLocale('ja')
  assert.equal(locale.bind('conversation')('key'), '停止')
})

test('one owner per namespace and locale', () => {
  const locale = runtime()
  locale.register('ns', 'ja', { key: 'first' })
  assert.throws(() => { locale.register('ns', 'ja', { key: 'second' }) }, /already has locale/)
})

test('disposing a registration removes exactly what it added', () => {
  const locale = runtime()
  locale.register('ns', 'en', { key: 'English' })
  const dispose = locale.register('ns', 'ja', { key: '日本語' })
  locale.setLocale('ja')
  assert.equal(locale.bind('ns')('key'), '日本語')
  dispose()
  assert.equal(locale.bind('ns')('key'), 'English')
})

test('the revision advances on a switch and on a registration', () => {
  const locale = runtime()
  const start = locale.getSnapshot().revision
  locale.register('ns', 'en', { key: 'English' })
  const afterRegister = locale.getSnapshot().revision
  assert.ok(afterRegister > start, 'registration must bump the revision')
  locale.setLocale('ja')
  assert.ok(locale.getSnapshot().revision > afterRegister, 'a switch must bump the revision')
})

test('subscribers are notified, and one that throws does not strand the rest', () => {
  const locale = runtime()
  const seen: string[] = []
  locale.subscribe(() => { throw new Error('subscriber blew up') })
  locale.subscribe(() => { seen.push(locale.getSnapshot().active) })
  locale.setLocale('ko')
  assert.deepEqual(seen, ['ko'])
})

test('a locale switch emits locale/change; a registration does not', () => {
  const { ctx, emitted } = stubContext()
  const locale = new LocaleRuntime(ctx)
  locale.register('ns', 'en', { key: 'English' })
  assert.equal(emitted.length, 0, 'registration must stay off the event')
  locale.setLocale('ja')
  assert.equal(emitted.length, 1)
})

test('a bound translate keeps its identity so memoized consumers survive a switch', () => {
  const locale = runtime()
  assert.equal(locale.bind('ns'), locale.bind('ns'))
})

test('a stored preference this roster ships is adopted', () => {
  const { scope } = stubScope({ preference: 'ja' })
  const locale = new LocaleRuntime(stubContext().ctx, scope)
  assert.equal(locale.getLocale().active, 'ja')
})

test('a stored preference this roster dropped is not adopted', () => {
  // The document key is shared with every other build of this plugin, so a
  // home that once ran a wider roster has an id on disk this one does not
  // ship. Adopting it would select a locale the row cannot show and send
  // every lookup to English.
  const { scope, writes } = stubScope({ preference: 'yue' })
  const locale = new LocaleRuntime(stubContext().ctx, scope)
  assert.equal(locale.getLocale().active, 'en')
  assert.deepEqual(writes, [], 'the stored id stays on disk untouched')
})
