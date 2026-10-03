import { strict as assert } from 'node:assert'
import { execFile } from 'node:child_process'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { test } from 'node:test'
import { foreignSources } from '../scripts/lib/foreign.mjs'

const run = promisify(execFile)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * The gates read a real harness checkout. Without one they cannot run at all,
 * so the suite says so rather than passing on nothing.
 */
function harness(): string | undefined {
  const named = process.env.DSH_HARNESS
  // Pinned vendor checkouts first, matching harnessRoot: a loose working
  // clone is at whatever its owner last pulled, not at the fork point.
  const candidates = named !== undefined ? [named] : [
    join(root, '..', 'negen', 'vendors', 'deepseek-harness'),
    join(root, '..', 'deepseek-harness'),
  ]
  return candidates.find(c => existsSync(join(c, 'packages', 'client', 'locale')))
}

/** Run a gate and report how it exited. */
async function gate(script: string, checkout: string) {
  try {
    // DSH_HARNESS is cleared so the checkout argument is unambiguously what runs.
    const env = { ...process.env, DSH_HARNESS: '' }
    const { stdout } = await run('node', [join(root, 'scripts', script), checkout], { env })
    return { code: 0, output: stdout }
  } catch (error) {
    const e = error as { code?: number, stdout?: string, stderr?: string }
    return { code: e.code ?? 1, output: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

/**
 * Run a gate with a sibling checkout named explicitly, the way a machine that
 * keeps its working copies somewhere other than beside this repository does.
 */
async function gateWithSibling(script: string, checkoutDir: string, siblingDir: string) {
  try {
    const env = { ...process.env, DSH_HARNESS: '', DSH_FOREIGN_DIRS: siblingDir }
    const { stdout } = await run('node', [join(root, 'scripts', script), checkoutDir], { env })
    return { code: 0, output: stdout }
  } catch (error) {
    const e = error as { code?: number, stdout?: string, stderr?: string }
    return { code: e.code ?? 1, output: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

const checkout = harness()

test('the fork gate passes against the pinned checkout', { skip: checkout === undefined && 'no harness checkout' }, async () => {
  const result = await gate('verify-fork.mjs', checkout!)
  assert.equal(result.code, 0, result.output)
  assert.match(result.output, /forked files unchanged/)
})

test('the fork gate fails when an upstream file it forked changes', { skip: checkout === undefined && 'no harness checkout' }, async () => {
  const temp = await mkdtemp(join(tmpdir(), 'negen-locale-fork-'))
  try {
    await cp(join(checkout!, 'packages'), join(temp, 'packages'), { recursive: true })
    const victim = join(temp, 'packages', 'client', 'ui-theme', 'src', 'styles', 'base.css')
    await writeFile(victim, `${await readFile(victim, 'utf8')}\n/* upstream moved */\n`, 'utf8')

    const result = await gate('verify-fork.mjs', temp)
    assert.equal(result.code, 1, 'a changed upstream file must fail the gate')
    assert.match(result.output, /changed upstream: .*base\.css/)
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})

test('the fork gate fails when the desktop app stops keying its welcome copy by the locale row', { skip: checkout === undefined && 'no harness checkout' }, async () => {
  // The break this seam was added for, learned the hard way: a bundle that
  // takes ownership of the `locale` row removes the settings namespace the
  // desktop main looks for, and the window it opens the app with never boots.
  // The seam is upstream's side of that contract; this proves the gate sees it
  // move rather than trusting the comment above it.
  const temp = await mkdtemp(join(tmpdir(), 'negen-locale-desktop-'))
  try {
    await cp(join(checkout!, 'packages'), join(temp, 'packages'), { recursive: true })
    await cp(join(checkout!, 'apps', 'desktop', 'src'), join(temp, 'apps', 'desktop', 'src'), { recursive: true })
    const victim = join(temp, 'apps', 'desktop', 'src', 'welcome-backend.ts')
    const source = await readFile(victim, 'utf8')
    await writeFile(victim, source.replace("item.ns === 'locale'", "item.ns === 'i18n'"), 'utf8')

    const result = await gate('verify-fork.mjs', temp)
    assert.equal(result.code, 1, 'a moved seam must fail the gate')
    assert.match(result.output, /seam moved/)
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})

test('the fork gate fails when a seam it depends on moves', { skip: checkout === undefined && 'no harness checkout' }, async () => {
  const temp = await mkdtemp(join(tmpdir(), 'negen-locale-seam-'))
  try {
    await cp(join(checkout!, 'packages'), join(temp, 'packages'), { recursive: true })
    // Rename the row this bundle disables. Nothing in this repo would notice:
    // the patch would stop disabling anything and two locale plugins would
    // race to install the face.
    const patch = join(temp, 'packages', 'bundle', 'web-app', 'cordis.patch.yml')
    const source = await readFile(patch, 'utf8')
    await writeFile(patch, source.replace("name: '@deepseek-ai/dsh-client-locale'", "name: '@deepseek-ai/dsh-client-i18n'"), 'utf8')

    const result = await gate('verify-fork.mjs', temp)
    assert.equal(result.code, 1, 'a moved seam must fail the gate')
    assert.match(result.output, /seam moved/)
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})

test('the dictionary gate passes against the recorded snapshot', { skip: checkout === undefined && 'no harness checkout' }, async () => {
  const result = await gate('verify-dicts.mjs', checkout!)
  assert.equal(result.code, 0, result.output)
  assert.match(result.output, /no translation contradicts upstream/)
})

test('the dictionary gate fails on a translation of a key upstream does not have', { skip: checkout === undefined && 'no harness checkout' }, async () => {
  // The decay this catches: upstream renames or drops a key, and the
  // translation beside it goes on rendering text for something that is gone.
  const probe = join(root, 'dict', 'ja', 'sidebar.json')
  const original = await readFile(probe, 'utf8')
  try {
    const tampered = { ...JSON.parse(original), 'session.renamedUpstream': 'これは上流にありません' }
    await writeFile(probe, `${JSON.stringify(tampered, null, 2)}\n`, 'utf8')

    const result = await gate('verify-dicts.mjs', checkout!)
    assert.equal(result.code, 1, 'a stale translated key must fail the gate')
    assert.match(result.output, /upstream does not have/)
  } finally {
    await writeFile(probe, original, 'utf8')
  }
})

test('the dictionary gate fails when upstream rewords a key this repo translates', { skip: checkout === undefined && 'no harness checkout' }, async () => {
  // The quieter decay: the key still exists, the translation still renders,
  // and it now says something different from the English beside it.
  const snapshotPath = join(root, 'dict', 'upstream.snapshot.json')
  const original = await readFile(snapshotPath, 'utf8')
  try {
    const snapshot = JSON.parse(original)
    snapshot.namespaces.sidebar.en['session.new'] = 'Start a conversation'
    await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')

    const result = await gate('verify-dicts.mjs', checkout!)
    assert.equal(result.code, 1, 'a reworded upstream key must fail the gate')
    assert.match(result.output, /was reworded upstream/)
  } finally {
    await writeFile(snapshotPath, original, 'utf8')
  }
})

test('the dictionary gate fails when a sibling package retires a translated key', { skip: checkout === undefined && 'no harness checkout' }, async (t) => {
  // The sibling checkout is what puts an externally-owned namespace in front of
  // this gate at all. Without it `dict/*/archive.json` is ungated: a key its
  // owner retires leaves three translations answering nothing, and a key its
  // owner adds renders English forever — neither shows up anywhere.
  const foreign = foreignSources(root)
  if (foreign.length === 0) return t.skip('no sibling package checkout on this machine')
  const temp = await mkdtemp(join(tmpdir(), 'negen-locale-sibling-'))
  try {
    await cp(join(foreign[0]!.root, 'src'), join(temp, 'src'), { recursive: true })
    const locales = join(temp, 'src', 'client', 'locales.ts')
    const source = await readFile(locales, 'utf8')
    const retired = source.replace(/^\s*"close": "Close",\n/m, '')
    assert.notEqual(retired, source, 'the fixture must actually lose a key')
    await writeFile(locales, retired, 'utf8')

    const result = await gateWithSibling('verify-dicts.mjs', checkout!, temp)
    assert.equal(result.code, 1, 'a retired sibling key must fail the gate')
    assert.match(result.output, /archive\/close was removed upstream/)
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
})
