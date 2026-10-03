import { strict as assert } from 'node:assert'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { extractDictionaries } from '../scripts/lib/extract-dicts.mjs'
import { foreignSources } from '../scripts/lib/foreign.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** The pinned checkout the dictionary gate reads; without one nothing here can run. */
function harness(): string | undefined {
  const named = process.env.DSH_HARNESS
  const candidates = named !== undefined && named !== '' ? [named] : [
    join(root, '..', 'negen', 'vendors', 'deepseek-harness'),
    join(root, '..', 'deepseek-harness'),
  ]
  return candidates.find(c => existsSync(join(c, 'packages', 'client', 'locale')))
}

const checkout = harness()
const skip = checkout === undefined && 'no harness checkout'

test('every namespace upstream declares is extracted', { skip }, async () => {
  const { namespaces, orphans } = await extractDictionaries(checkout!)
  assert.deepEqual(orphans, [], 'a declared namespace with no dictionary means the scanner missed one')
  assert.ok(Object.keys(namespaces).length >= 28, `only ${Object.keys(namespaces).length} namespaces`)
})

test('nothing upstream ships is unreadable', { skip }, async () => {
  // The scanner reports what it cannot parse rather than dropping it, and a
  // reported key is one this package can never translate: adding it would
  // read as a key upstream does not have. Empty is the only acceptable list.
  const { unreadable } = await extractDictionaries(checkout!)
  assert.deepEqual(unreadable, [])
})

test('namespaces registered without a declare-merge are extracted too', { skip }, async () => {
  // `directory-browser` never reaches LocaleNamespaceMap: it is registered
  // through the untyped register(ns, locale, dict) form under a private const.
  // Nothing else names it, so a scanner that keys only off the declare-merge
  // leaves it permanently English.
  const { namespaces } = await extractDictionaries(checkout!)
  assert.equal(namespaces['directory-browser']?.en['browser.newFolder'], 'New folder')
})

test('a declaration whose dictionaries live in a sibling module is extracted', { skip }, async () => {
  // `permission.access` declares `keyof typeof accessEn`, and accessEn/accessZh
  // are exported by the sibling locales.ts rather than the file that declares
  // the namespace. The declare-merge cannot see across that boundary; the
  // register call — `{ zh: accessZh, en: accessEn }` — is the only thing that
  // names the pair. Left unread the namespace looks *gone upstream*, and a
  // prune that trusts the gate then deletes translations for text still on
  // screen.
  const { namespaces } = await extractDictionaries(checkout!)
  assert.equal(namespaces['permission.access']?.en['confirm.enable'], 'Enable Full access')
  // Shorthand bindings (`{ zh, en }`, both imported) resolve the same way.
  // `shortcuts` is a namespace that stayed invisible for as long as this gate
  // has existed.
  assert.equal(namespaces['shortcuts']?.en['edit-label'], 'Edit shortcut for {command}')
  assert.ok(Object.keys(namespaces['shortcuts']!.en).length > 40)
})

test('a dictionary spread in from a sibling module is extracted', { skip }, async () => {
  // `export const en = { ...guideEn, builtInGroup: 'Built-in' }`: the keys are
  // upstream's and the text is upstream's, and only the spelling hides them.
  // The same literal keeps its longest copy as paragraphs joined at load time,
  // where reading only the first element records a fraction of the text — and
  // a translation of that fraction then passes every check.
  const { namespaces } = await extractDictionaries(checkout!)
  const preset = namespaces['settings.agentPreset']!.en
  assert.match(preset.guideStandardIntro!, /^Choose Standard mode when starting a new task\./)
  const explanation = preset.guideStandardExplanation!
  assert.equal(explanation.split('\n\n').length, 4)
  assert.match(explanation, /^### How it works/)
  assert.match(explanation, /it is not required for batch tasks\.$/)
})

test('a namespace owned outside the harness is read from its own checkout', { skip }, async (t) => {
  // The harness supplies 54 namespaces to watch. A plugin repository owns its
  // own, and its corpus file is invisible without this: a key its owner adds
  // renders English forever, and one its owner retires leaves a translation
  // answering nothing. Read-only checkouts of those packages are named in
  // scripts/lib/foreign.mjs.
  const foreign = foreignSources(root)
  if (foreign.length === 0) return t.skip('no sibling package checkout on this machine')
  const { namespaces } = await extractDictionaries(checkout!, foreign)
  const archive = namespaces['archive']
  assert.ok(archive !== undefined, 'the sibling namespace was not extracted')
  assert.equal(archive.package, 'negen-archive')
  assert.equal(archive.en['button.archived'], 'Archived')
  assert.equal(archive.en['menu.confirmDelete'], 'Delete permanently')
  assert.equal(
    Object.keys(archive.en).length, Object.keys(archive.zh).length,
    'the owner declares both dictionaries complete against one key set',
  )
})
