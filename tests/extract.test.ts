import { strict as assert } from 'node:assert'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { extractDictionaries } from '../scripts/lib/extract-dicts.mjs'

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
  // Two upstream namespaces never reach LocaleNamespaceMap: they are
  // registered through the untyped register(ns, locale, dict) form under a
  // private const. Nothing else names them, so a scanner that keys only off
  // the declare-merge leaves them permanently English.
  const { namespaces } = await extractDictionaries(checkout!)
  assert.equal(namespaces['directory-browser']?.en['browser.newFolder'], 'New folder')
  assert.equal(namespaces['permission.access']?.en['confirm.enable'], 'Enable Full access')
})

test('a value read by dotted path out of a shared object resolves', { skip }, async () => {
  // upstream's welcome notice keeps its copy in one object and reads it into
  // both dictionaries by path; a scanner that only understands string
  // literals reports these three keys as unreadable.
  const { namespaces } = await extractDictionaries(checkout!)
  const models = namespaces['settings.models']!.en
  assert.equal(models.welcomeTitle, 'Internal Testing Notice')
  assert.equal(models.welcomeContinue, 'Continue')
  assert.match(models.welcomeBody!, /DeepSeek Harness 0\.1 remains in testing/)
})

test('a value spelled as concatenated string literals is read whole', { skip }, async () => {
  // Reading only the first operand records half a sentence as the complete
  // English text — and a translation of that half then passes every check.
  const { namespaces } = await extractDictionaries(checkout!)
  const preset = namespaces['settings.agentPreset']!.en
  assert.match(preset.sectionIntro!, /let the agent draft one for you in Creator mode\.$/)
  assert.match(preset.copyIntro!, /edited in the preset's own files\.$/)
})
