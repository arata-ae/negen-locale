import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { injectStyleTag } from '../src/client/style-tag.ts'

/** The three DOM members injectStyleTag touches. */
function stubDocument() {
  const children: { dataset: Record<string, string>, textContent: string, remove: () => void }[] = []
  const document = {
    querySelector: (selector: string) =>
      children.find(tag => selector.includes(`"${tag.dataset.plugin}"`)) ?? null,
    createElement: () => ({
      dataset: {} as Record<string, string>,
      textContent: '',
      // A real Node.remove() on a detached node is a no-op; splice(-1, 1)
      // would instead drop somebody else's tag.
      remove() {
        const at = children.indexOf(this as never)
        if (at >= 0) children.splice(at, 1)
      },
    }),
    head: { appendChild: (tag: never) => { children.push(tag) } },
  }
  return { children, document }
}

/**
 * Install with a stubbed document, then put the global back. The module reads
 * `document` at call time, so the stub only has to stand during the call.
 */
function withDocument<T>(document: unknown, body: () => T): T {
  const global = globalThis as { document?: unknown }
  global.document = document
  try {
    return body()
  } finally {
    delete global.document
  }
}

test('a non-browser run installs nothing and disposes cleanly', () => {
  assert.doesNotThrow(() => { injectStyleTag('marker', 'body{}')() })
})

test('the tag carries its marker and its css', () => {
  const { children, document } = stubDocument()
  withDocument(document, () => { injectStyleTag('negen-test', 'body{color:red}') })
  assert.equal(children.length, 1)
  assert.equal(children[0]?.dataset.plugin, 'negen-test')
  assert.equal(children[0]?.textContent, 'body{color:red}')
})

test('a second install of the same marker appends nothing', () => {
  const { children, document } = stubDocument()
  withDocument(document, () => {
    injectStyleTag('negen-test', 'a{}')
    injectStyleTag('negen-test', 'a{}')
  })
  assert.equal(children.length, 1)
})

test('different markers coexist', () => {
  const { children, document } = stubDocument()
  withDocument(document, () => {
    injectStyleTag('one', 'a{}')
    injectStyleTag('two', 'b{}')
  })
  assert.equal(children.length, 2)
})

test('the disposer removes only its own tag, and repeats harmlessly', () => {
  const { children, document } = stubDocument()
  withDocument(document, () => {
    const first = injectStyleTag('one', 'a{}')
    injectStyleTag('two', 'b{}')
    first()
    first()
    assert.equal(children.length, 1)
    assert.equal(children[0]?.dataset.plugin, 'two')
  })
})

test('a duplicate install owns nothing, so its disposer leaves the tag alone', () => {
  const { children, document } = stubDocument()
  withDocument(document, () => {
    injectStyleTag('one', 'a{}')
    injectStyleTag('one', 'a{}')()
    assert.equal(children.length, 1)
  })
})
