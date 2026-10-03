/**
 * Pull upstream's locale dictionaries out of a harness checkout.
 *
 * There is no machine-readable roster of namespaces to read, so this reads
 * the two places the information actually lives: the `LocaleNamespaceMap`
 * declare-merge that names each namespace and its key type, and the
 * `export const en` / `export const zh` object literals that carry the text.
 *
 * A hand-rolled scanner rather than a TypeScript parse, because these are
 * flat maps of string literals and nothing else — anything it cannot read is
 * reported rather than skipped, so a shape it does not understand fails the
 * gate instead of silently shrinking the corpus.
 */

import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/** Locate every .ts/.tsx file beneath a directory. */
async function sources(dir) {
  const found = []
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return found
  }
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'lib') continue
      found.push(...await sources(path))
    } else if (/\.tsx?$/.test(entry.name) && !/\.spec\./.test(entry.name)) {
      found.push(path)
    }
  }
  return found
}

/**
 * Find the body of a brace-delimited block starting at an opening brace.
 * @param source - the whole file.
 * @param open - index of the `{`.
 * @returns the body between the braces, or null when unbalanced.
 */
function block(source, open) {
  let depth = 0
  let quote = null
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i]
    if (quote !== null) {
      if (ch === '\\') i += 1
      else if (ch === quote) quote = null
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue }
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return source.slice(open + 1, i)
    }
  }
  return null
}

/**
 * Blank out comments so the brace/quote scanners cannot be fooled by an
 * apostrophe in prose ("the entry's namespace") or a brace in a code sample.
 * Lengths are preserved so every index stays valid against the original.
 */
function stripComments(source) {
  let out = ''
  let i = 0
  let quote = null
  while (i < source.length) {
    const ch = source[i]
    if (quote !== null) {
      out += ch
      if (ch === '\\') { out += source[i + 1] ?? ''; i += 2; continue }
      if (ch === quote) quote = null
      i += 1
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; out += ch; i += 1; continue }
    if (ch === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') { out += ' '; i += 1 }
      continue
    }
    if (ch === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2)
      const stop = end === -1 ? source.length : end + 2
      for (let j = i; j < stop; j += 1) out += source[j] === '\n' ? '\n' : ' '
      i = stop
      continue
    }
    out += ch
    i += 1
  }
  return out
}

/**
 * Namespace declarations inside a LocaleNamespaceMap block, as the raw type
 * expression upstream wrote — `CommonKey`, `import('../locale.ts').ChatKey`,
 * or `keyof typeof zh`. Capturing only the first identifier silently renamed
 * the last two to `import` and `keyof`, which matched no dictionary and
 * dropped three whole namespaces out of the gate's view.
 */
function namespaceDeclarations(source) {
  const found = new Map()
  const marker = /interface\s+LocaleNamespaceMap\s*\{/g
  const type = 'import\\s*\\([^()]*\\)\\s*\\.\\s*[A-Za-z_$][\\w$]*'
    + '|keyof\\s+typeof\\s+[A-Za-z_$][\\w$]*'
    + '|[A-Za-z_$][\\w$]*'
  let match
  while ((match = marker.exec(source)) !== null) {
    const body = block(source, match.index + match[0].length - 1)
    if (body === null) continue
    const entry = new RegExp(
      `(?:^|\\n)\\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\\w$]*))\\s*:\\s*(${type})`, 'g')
    for (const declaration of body.matchAll(entry)) {
      const ns = declaration[1] ?? declaration[2] ?? declaration[3]
      found.set(ns, declaration[4].replace(/\s+/g, ' '))
    }
  }
  return found
}

/**
 * Resolve one raw declared type expression to the name the package's
 * dictionaries carry.
 *
 * Three spellings ship upstream. A bare type name is already that name. An
 * imported one — `import('./locales.ts').SidebarDocumentPreviewKey` — names the
 * type in the trailing member, and the dictionaries it covers live in a sibling
 * file of the same package. `keyof typeof zh` names no type at all: the
 * dictionary beside it IS the key set, so it resolves through the file's own
 * `keyof typeof` declarations and, failing those, to the dictionary by name.
 * @param raw - the declared type expression.
 * @param owned - this file's `dict const -> declared key type` table.
 * @returns the key type name, the local dictionary to match, or null.
 */
function resolveDeclaration(raw, owned) {
  const imported = /^import\s*\([^()]*\)\s*\.\s*([A-Za-z_$][\w$]*)$/.exec(raw)
  if (imported !== null) return { keyType: imported[1], local: null }
  const local = /^keyof\s+typeof\s+([A-Za-z_$][\w$]*)$/.exec(raw)
  if (local !== null) return { keyType: owned.get(local[1]) ?? null, local: local[1] }
  return /^[A-Za-z_$][\w$]*$/.test(raw) ? { keyType: raw, local: null } : null
}

/**
 * `const NAME = 'text'` string constants, which dictionaries reference by name.
 *
 * The first letter is not constrained: upstream also spells them lowercase —
 * `const locale = 'settings.sessionLog'` is the namespace a register call
 * passes — and requiring an uppercase start silently lost those.
 */
function stringConstants(source) {
  const found = new Map()
  for (const m of source.matchAll(/(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g)) {
    found.set(m[1], (m[2] ?? m[3]).replace(/\\(['"\\])/g, '$1'))
  }
  return found
}

/**
 * Resolve `NAME.a.b` against a nested object literal declared in the corpus —
 * upstream keeps some copy in one shared object and reads it into both
 * dictionaries by path.
 * @param corpus - the package's sources, joined.
 * @param path - a dotted reference, `NAME` first.
 * @returns the string it names, or undefined when any segment is unreadable.
 */
function resolvePath(corpus, path) {
  // Anything that is not an identifier path is not a reference to one; the
  // caller hands over raw source text, and compiling that as a pattern threw
  // on the first help-copy array the scanner reached.
  if (!/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/.test(path)) return undefined
  const [name, ...rest] = path.split('.')
  if (rest.length === 0) return undefined
  const root = new RegExp(`const\\s+${name}\\s*(?::[^=]+?)?\\s*=\\s*\\{`).exec(corpus)
  if (root === null) return undefined
  let body = block(corpus, root.index + root[0].length - 1)
  for (const segment of rest.slice(0, -1)) {
    if (body === null) return undefined
    const descend = new RegExp(`(?:^|[,{])\\s*'?${segment}'?\\s*:\\s*\\{`).exec(body)
    if (descend === null) return undefined
    body = block(body, descend.index + descend[0].length - 1)
  }
  if (body === null) return undefined
  const leaf = rest[rest.length - 1]
  const value = new RegExp(
    `(?:^|[,{])\\s*'?${leaf}'?\\s*:\\s*(?:'((?:[^'\\\\]|\\\\.)*)'|"((?:[^"\\\\]|\\\\.)*)")`,
  ).exec(body)
  if (value === null) return undefined
  let text = decode(value[1] ?? value[2])
  let cursor = value.index + value[0].length
  for (;;) {
    const next = CONTINUATION.exec(body.slice(cursor))
    if (next === null) break
    text += decode(next[1] ?? next[2])
    cursor += next[0].length
  }
  return text
}

/**
 * Parse a flat `{ 'key': 'value' }` literal. Returns entries plus anything
 * unreadable.
 *
 * Scanned character by character rather than with one regular expression: a
 * value can contain a comma (upstream's zh onboarding copy has a paragraph with
 * several), and a `,`-delimited pattern reads the tail of that sentence as a key
 * and then finds nothing else — which is how `settings.models` reported 100
 * English keys against zero Chinese ones while the Chinese text sat right there.
 * @param body - the literal's body.
 * @param constants - `const NAME = 'text'` values a member may name instead.
 * @param corpus - the package's sources, joined; lets a member spelled as a
 * dotted path into a shared object resolve rather than read as unreadable.
 */
function flatMap(body, constants = new Map(), corpus = '') {
  const entries = {}
  const unreadable = []
  /** `...name` members, for the caller to resolve against the file's imports. */
  const spreads = []
  let i = 0

  /** Step over a string literal, starting at its quote. */
  function skipString() {
    const quote = body[i]
    i += 1
    while (i < body.length) {
      if (body[i] === '\\') { i += 2; continue }
      if (body[i] === quote) { i += 1; return }
      i += 1
    }
  }

  /**
   * Step over one value, answering what kind it was.
   * @returns 'string' when a literal was consumed, 'other' otherwise.
   */
  function skipValue() {
    if (body[i] === "'" || body[i] === '"') { skipString(); return 'string' }
    if (body[i] === '{' || body[i] === '[') {
      const open = body[i]
      const close = open === '{' ? '}' : ']'
      let depth = 0
      while (i < body.length) {
        const ch = body[i]
        if (ch === "'" || ch === '"' || ch === '`') { skipString(); continue }
        if (ch === open) depth += 1
        else if (ch === close) {
          depth -= 1
          if (depth === 0) { i += 1; return 'other' }
        }
        i += 1
      }
      return 'other'
    }
    const start = i
    while (i < body.length && body[i] !== ',') {
      if (body[i] === '{' || body[i] === '[') { i = start + 1; return skipValue() }
      i += 1
    }
    return 'other'
  }

  while (i < body.length) {
    while (i < body.length && /[\s,]/.test(body[i])) i += 1
    if (i >= body.length) break
    const keyStart = i
    if (body[i] === "'" || body[i] === '"') skipString()
    else while (i < body.length && /[\w$.'"[\]]/.test(body[i])) i += 1
    const key = body.slice(keyStart, i).replace(/^['"]|['"]$/g, '')
    while (i < body.length && /\s/.test(body[i])) i += 1
    if (body[i] !== ':') {
      // `...name` pulls a sibling module's literal in, and the text is real —
      // it just is not in this file. Recorded for the caller to resolve rather
      // than reported: a spread the caller cannot follow is what it reports.
      if (body.startsWith('...', keyStart)) spreads.push(key.slice(3))
      // `{ key }` shorthand is legal and carries no text.
      else unreadable.push(key)
      while (i < body.length && body[i] !== ',') i += 1
      continue
    }
    i += 1
    while (i < body.length && /\s/.test(body[i])) i += 1
    const valueStart = i
    if (skipValue() !== 'string') {
      // A value spelled as a shared constant or a dotted path into one is still
      // a readable entry; anything else is a shape this gate cannot vouch for.
      const raw = body.slice(valueStart, i).trim().replace(/,$/, '')
      if (raw.startsWith('[')) {
        const joined = arrayJoin(body, valueStart)
        if (joined !== null) {
          entries[key] = joined.text
          i = joined.end
          continue
        }
      }
      const named = constants.get(raw) ?? (corpus === '' ? undefined : resolvePath(corpus, raw))
      if (named !== undefined) { entries[key] = named; continue }
      if (raw !== '') unreadable.push(key)
      // Step to the next member: an expression the scanner cannot read can be
      // followed by a call or a property access it would otherwise read as a key.
      while (i < body.length && body[i] !== ',') i += 1
      continue
    }
    // The literal just consumed may be one operand of `'first ' + 'second'`.
    const quoted = body.slice(valueStart, i)
    let text = decode(quoted.slice(1, -1))
    let cursor = i
    for (;;) {
      const next = CONTINUATION.exec(body.slice(cursor))
      if (next === null) break
      text += decode(next[1] ?? next[2])
      cursor += next[0].length
    }
    i = cursor
    entries[key] = text
  }
  return { entries, unreadable, spreads }
}

/**
 * Local name -> module specifier, for every named import in a file.
 *
 * A spread names the LOCAL binding, so an aliased import (`guideEn as guide`)
 * is followed under the name the literal actually spreads.
 * @param source - one comment-stripped source file.
 * @returns the import table.
 */
function importsOf(source) {
  const found = new Map()
  for (const m of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    for (const piece of m[1].split(',')) {
      const [original, alias] = piece.split(/\s+as\s+/).map(part => part.trim())
      if (original !== undefined && original !== '') found.set(alias ?? original, m[2])
    }
  }
  return found
}

/**
 * Resolve a relative import specifier beside its importer.
 * @param file - absolute path of the importing file.
 * @param specifier - the module specifier as written.
 * @returns the absolute path to try first, or undefined for a bare specifier.
 */
function resolveSibling(file, specifier) {
  return specifier.startsWith('.') ? join(dirname(file), specifier) : undefined
}

/**
 * Read a named `const NAME = { ... }` literal out of a file, spreads and all.
 * @param source - the file's comment-stripped source.
 * @param name - the binding to read.
 * @param corpus - sources of the package, for dotted references into shared objects.
 * @returns the parsed literal, or null when the file declares no such object.
 */
function exportedLiteral(source, name, corpus) {
  const marker = new RegExp(`(?:export\\s+)?const\\s+${name}\\s*(?::[^=]+?)?\\s*=\\s*\\{`)
  const match = marker.exec(source)
  if (match === null) return null
  const body = block(source, match.index + match[0].length - 1)
  if (body === null) return null
  return flatMap(body, stringConstants(source), corpus)
}

/**
 * Merge every `...name` a literal spreads into the literal itself.
 *
 * Upstream keeps part of a dictionary in a sibling module and folds it in by
 * spread — `export const en = { ...guideEn, builtInGroup: 'Built-in' }`. The
 * keys are upstream's and the text is upstream's; only the spelling hides
 * them. Reading them matters twice over: the gate cannot otherwise see the
 * keys at all, and a key it cannot see reads as one upstream retired, which is
 * how a live translation gets deleted by a prune that was only following the
 * gate.
 * @param literal - a parsed literal, with its unresolved spreads.
 * @param file - absolute path of the file the literal came from.
 * @param read - every source in the package, keyed by absolute path.
 * @param corpus - sources of the package, joined.
 * @param seen - file/name pairs already being resolved, to stop a cycle.
 * @returns the merged entries, and what could not be followed.
 */
function foldSpreads(literal, file, read, corpus, seen = new Set()) {
  const entries = { ...literal.entries }
  const unreadable = [...literal.unreadable]
  for (const name of literal.spreads) {
    if (seen.has(`${file}\u0000${name}`)) {
      unreadable.push(`...${name} (spread cycle)`)
      continue
    }
    seen.add(`${file}\u0000${name}`)
    const home = read.get(file) ?? ''
    const own = exportedLiteral(home, name, corpus)
    const specifier = importsOf(home).get(name)
    const base = specifier === undefined ? undefined : resolveSibling(file, specifier)
    const target = base === undefined
      ? undefined
      : [base, `${base}.ts`, `${base}.tsx`].find(candidate => read.has(candidate))
    const source = target === undefined ? undefined : read.get(target)
    const imported = source === undefined ? null : exportedLiteral(source, name, corpus)
    const inner = own ?? imported
    const from = own === null ? target : file
    if (inner === null || from === undefined) {
      unreadable.push(`...${name} (no readable literal behind the spread)`)
      continue
    }
    const folded = foldSpreads(inner, from, read, corpus, seen)
    Object.assign(entries, folded.entries)
    unreadable.push(...folded.unreadable)
  }
  return { entries, unreadable }
}

/**
 * Read `[ 'a', 'b' ].join('sep')`.
 *
 * Upstream keeps its longest help copy as an array of paragraphs joined at
 * load time. Every element is a literal and the text is the paragraphs
 * together, so it is readable — but the scanner has to consume the `.join()`
 * call too, or it reads the call itself as the next key.
 * @param body - the literal's body.
 * @param start - index of the `[`.
 * @returns the joined text and the index just past the call, or null when the
 * array holds anything but literals.
 */
function arrayJoin(body, start) {
  const parts = []
  let i = start
  let depth = 0
  while (i < body.length) {
    const ch = body[i]
    if (ch === "'" || ch === '"') {
      let j = i + 1
      let text = ''
      while (j < body.length && body[j] !== ch) {
        if (body[j] === '\\') { text += body[j + 1] ?? ''; j += 2; continue }
        text += body[j]
        j += 1
      }
      parts.push(decode(text))
      i = j + 1
      continue
    }
    if (ch === '[') depth += 1
    else if (ch === ']') {
      depth -= 1
      if (depth === 0) { i += 1; break }
    } else if (depth === 1 && /[A-Za-z_$]/.test(ch)) return null
    i += 1
  }
  const call = /^\s*\.\s*join\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")\s*\)/.exec(body.slice(i))
  if (call === null) return null
  return { text: parts.join(decode(call[1] ?? call[2])), end: i + call[0].length }
}

/**
 * The file a local binding is imported from, when it is imported at all.
 * @param name - the local binding.
 * @param file - the importing file.
 * @param read - every source in the package, keyed by absolute path.
 * @returns the absolute path of the sibling, or undefined.
 */
function importedFrom(name, file, read) {
  const specifier = importsOf(read.get(file) ?? '').get(name)
  const base = specifier === undefined ? undefined : resolveSibling(file, specifier)
  return base === undefined
    ? undefined
    : [base, `${base}.ts`, `${base}.tsx`].find(candidate => read.has(candidate))
}

/**
 * Read a `const NAME = 'text'` a file declares or imports.
 * @param name - the binding.
 * @param file - the file naming it.
 * @param read - every source in the package.
 * @returns the string, or undefined.
 */
function constantValue(name, file, read) {
  const own = stringConstants(read.get(file) ?? '').get(name)
  if (own !== undefined) return own
  const target = importedFrom(name, file, read)
  return target === undefined ? undefined : stringConstants(read.get(target) ?? '').get(name)
}

/**
 * Read a `const NAME = { ... }` dictionary a file declares or imports.
 * @param name - the binding.
 * @param file - the file naming it.
 * @param read - every source in the package.
 * @param corpus - sources of the package, joined.
 * @returns the parsed literal, or null.
 */
function dictionaryBinding(name, file, read, corpus) {
  const own = exportedLiteral(read.get(file) ?? '', name, corpus)
  if (own !== null) return own
  const target = importedFrom(name, file, read)
  return target === undefined ? null : exportedLiteral(read.get(target) ?? '', name, corpus)
}

/**
 * Read every `locale.register(ns, { zh, en })` call in one file.
 *
 * The declare-merge names a key type; this names the two dictionaries that
 * feed the namespace, which is the only place that says so when the pair is
 * not spelled `en`/`zh` — `permission.access` declares `keyof typeof accessEn`
 * and registers `{ zh: accessZh, en: accessEn }`. Shorthand (`{ zh, en }`)
 * and aliased imports both name the local binding, so both are recorded as
 * written.
 * @param source - one comment-stripped source file.
 * @param file - that file's absolute path.
 * @param read - every source in the package.
 * @returns namespace -> the two binding names it registers.
 */
function registeredDictionaries(source, file, read) {
  const found = new Map()
  for (const m of source.matchAll(/\blocale\.register\(\s*(?:'([^']+)'|([A-Za-z_$][\w$]*))\s*,\s*\{([^}]*)\}/g)) {
    const ns = m[1] ?? constantValue(m[2], file, read)
    if (ns === undefined) continue
    const bindings = {}
    for (const piece of m[3].split(',')) {
      const colon = piece.indexOf(':')
      const key = (colon === -1 ? piece : piece.slice(0, colon)).trim()
      if (key !== 'zh' && key !== 'en') continue
      bindings[key] = (colon === -1 ? key : piece.slice(colon + 1)).trim()
    }
    if (bindings.en !== undefined || bindings.zh !== undefined) found.set(ns, bindings)
  }
  return found
}

/** `+ 'more text'` immediately after a string, the concatenation upstream writes. */
const CONTINUATION = /^\s*\+\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/

/**
 * Unescape one source string literal's body. `\uXXXX` is included because
 * upstream writes some ellipses that way, and leaving the escape in place
 * records text that never appears on screen.
 * @param raw - the literal's body, quotes excluded.
 * @returns the string it denotes.
 */
function decode(raw) {
  return raw.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\(['"\\])/g, '$1')
}

/** Dictionary literals: `export const <name> = { ... } satisfies Record<KeyType, string>`. */
function dictionaries(source, corpus = '') {
  const found = []
  const constants = stringConstants(source)
  const marker = /export\s+const\s+(zh|en)\s*(?::\s*([^=]+?))?\s*=\s*\{/g
  let match
  while ((match = marker.exec(source)) !== null) {
    const open = match.index + match[0].length - 1
    const body = block(source, open)
    if (body === null) continue
    const tail = source.slice(open + body.length + 2, open + body.length + 120)
    // Three spellings carry the key type: `satisfies Record<K, string>` after
    // the literal, `: Record<K, string>` before it, and the mapped type
    // `: { [Key in keyof typeof en]: string }` that ui-settings-models uses for
    // zh. Missing the third left that namespace with 100 English keys and no
    // Chinese ones at all, which the gate then reported as full coverage.
    const satisfies = /^\s*satisfies\s+Record<\s*([A-Za-z_$][\w$]*)\s*,/.exec(tail)
    const annotated = /Record<\s*([A-Za-z_$][\w$]*)\s*,/.exec(match[2] ?? '')
    const mapped = /\[\s*[A-Za-z_$][\w$]*\s+in\s+keyof\s+typeof\s+([A-Za-z_$][\w$]*)\s*\]/.exec(match[2] ?? '')
    const { entries, unreadable, spreads } = flatMap(body, constants, corpus)
    if (Object.keys(entries).length === 0) continue
    found.push({
      name: match[1],
      keyType: satisfies?.[1] ?? annotated?.[1] ?? mapped?.[1] ?? null,
      entries,
      unreadable,
      spreads,
    })
  }
  return found
}

/** `export type XxxKey = keyof typeof zh` — the source dict names its own key type. */
function keyTypeSources(source) {
  const found = new Map()
  for (const m of source.matchAll(/export\s+type\s+([A-Za-z_$][\w$]*)\s*=\s*keyof\s+typeof\s+([A-Za-z_$][\w$]*)/g)) {
    found.set(m[2], m[1])
  }
  return found
}

/** Read the literal a named const holds: `const accessEn = { ... }`. */
function namedLiteral(source, name, constants) {
  const marker = new RegExp(`const\\s+${name}\\s*(?::[^=]+?)?\\s*=\\s*\\{`)
  const match = marker.exec(source)
  if (match === null) return null
  const body = block(source, match.index + match[0].length - 1)
  return body === null ? null : flatMap(body, constants).entries
}

/**
 * Namespaces registered through the untyped `register(ns, locale, dict)` form.
 *
 * These never reach `LocaleNamespaceMap`, so the declare-merge scan above is
 * blind to them — and they are exactly the namespaces most at risk of going
 * untranslated, because nothing else names them either. Two spellings ship
 * upstream: a locale-tagged literal at the call site or in a
 * `[locale, dict]` tuple array, and a call site whose values are property
 * reads from a dictionary const declared elsewhere in the file.
 * @param source - one comment-stripped source file.
 * @param constants - the file's `const NAME = 'text'` table.
 * @param corpus - every source in the package, joined; a referenced
 * dictionary const usually lives in a sibling file.
 * @returns { ns, zh, en } when the file registers exactly one such namespace.
 */
function untypedRegistrations(source, constants, corpus) {
  const found = new Set()
  for (const m of source.matchAll(/\blocale\.register\(\s*(?:'([^']+)'|([A-Za-z_$][\w$]*))\s*,\s*(?:'(?:zh|en)'|[A-Za-z_$])/g)) {
    const ns = m[1] ?? constants.get(m[2])
    if (ns !== undefined) found.add(ns)
  }
  if (found.size !== 1) return null
  const dicts = { zh: {}, en: {} }
  for (const m of source.matchAll(/'(zh|en)'\s*,\s*\{/g)) {
    const body = block(source, m.index + m[0].length - 1)
    if (body === null) continue
    const direct = flatMap(body, constants).entries
    if (Object.keys(direct).length > 0) {
      Object.assign(dicts[m[1]], direct)
      continue
    }
    // Values are property reads from a const declared elsewhere in the file;
    // that const carries the literals.
    const reference = /([A-Za-z_$][\w$]*)\s*\[/.exec(body)
    if (reference === null) continue
    const resolved = namedLiteral(corpus, reference[1], constants)
    if (resolved !== null) Object.assign(dicts[m[1]], resolved)
  }
  if (Object.keys(dicts.en).length === 0 && Object.keys(dicts.zh).length === 0) return null
  return { ns: [...found][0], ...dicts }
}

/**
 * Extract every namespace's zh and en dictionaries from a checkout.
 *
 * The harness supplies the packages that ship inside it. `extraSources` adds
 * checkouts that own a namespace this corpus back-fills but that live in their
 * own repository; they are read exactly the same way, so a key their owner
 * adds is reported as an untranslated key instead of rendering English
 * forever, and one their owner retires is reported instead of leaving a
 * translation that answers nothing.
 * @param harness - checkout root.
 * @param extraSources - `{ package, src, root }` checkouts to read beside it.
 * @returns { namespaces, unreadable, orphans }
 */
export async function extractDictionaries(harness, extraSources = []) {
  const clientRoot = join(harness, 'packages', 'client')
  const packages = (await readdir(clientRoot, { withFileTypes: true }))
    .filter(e => e.isDirectory()).map(e => e.name)

  const namespaces = {}
  const unreadable = []
  const orphans = []

  const targets = [
    ...packages.map(pkg => ({ pkg, src: join(clientRoot, pkg, 'src'), root: harness })),
    ...extraSources.map(extra => ({ pkg: extra.package, src: extra.src, root: extra.root })),
  ]

  for (const target of targets) {
    const { pkg } = target
    // Messages are read by a human looking at a checkout, so a path is printed
    // relative to the root it came from — harness and sibling alike.
    const relative = file => (file.startsWith(target.root) ? file.slice(target.root.length + 1) : file)
    const files = await sources(target.src)
    const declared = new Map()
    const dicts = []
    const read = new Map()
    for (const file of files) read.set(file, stripComments(await readFile(file, 'utf8')))
    const corpus = [...read.values()].join('\n')
    for (const [file, source] of read) {
      const owned = keyTypeSources(source)
      for (const [ns, raw] of namespaceDeclarations(source)) {
        const resolved = resolveDeclaration(raw, owned)
        if (resolved === null) {
          unreadable.push(`${relative(file)}: ${ns} declares "${raw}", which this gate cannot read`)
          continue
        }
        declared.set(ns, { ...resolved, file })
      }
      const untyped = untypedRegistrations(source, stringConstants(source), corpus)
      if (untyped !== null) {
        namespaces[untyped.ns] = { package: pkg, keyType: null, zh: untyped.zh, en: untyped.en }
      }
      for (const dict of dictionaries(source, corpus)) {
        // `zh satisfies Record<string, string>` names no key type; the
        // `export type XxxKey = keyof typeof zh` beside it is the real one.
        const declaredType = dict.keyType === 'string' ? null : dict.keyType
        const keyType = declaredType ?? owned.get(dict.name) ?? null
        const folded = foldSpreads(dict, file, read, corpus)
        dicts.push({ ...dict, keyType, file, entries: folded.entries })
        for (const key of folded.unreadable) {
          unreadable.push(`${relative(file)}: ${dict.name}.${key}`)
        }
      }
    }
    const sourceOf = file => read.get(file) ?? ''
    for (const [ns, declaration] of declared) {
      // `keyof typeof zh` points at a dictionary rather than at a type name,
      // and that dictionary is only the right one in the file that declared
      // the namespace — every file in a package has its own `zh`.
      const scoped = declaration.local === null
        ? dicts
        : dicts.filter(d => d.file === declaration.file)
      // A dictionary whose own annotation is unreadable still names itself
      // `en` or `zh`, and the namespace declaration has already been resolved to
      // a specific key type — so falling back to the name is what keeps this
      // from reporting a namespace as fully translated when its whole `zh`
      // dictionary went unread (settings.models: 100 English keys, zero
      // Chinese, and nothing said so).
      const pick = name => scoped.find(d => d.name === name && d.keyType === declaration.keyType)
        ?? scoped.find(d => d.name === name)
      const zh = declaration.local === null ? pick('zh') : scoped.find(d => d.name === declaration.local)
      const en = declaration.local === null ? pick('en') : scoped.find(d => d.name === 'en')
      if (zh === undefined && en === undefined) {
        // The declaration names a key type; the register call names the two
        // dictionaries. When they live in a sibling module — which the
        // declare-merge cannot see — the call site is the only thing that says
        // which dictionaries this namespace actually shows.
        const bindings = registeredDictionaries(sourceOf(declaration.file), declaration.file, read).get(ns)
        const bound = bindings === undefined ? null : {
          en: bindings.en === undefined ? null : dictionaryBinding(bindings.en, declaration.file, read, corpus),
          zh: bindings.zh === undefined ? null : dictionaryBinding(bindings.zh, declaration.file, read, corpus),
        }
        if (bound !== null && (bound.en !== null || bound.zh !== null)) {
          namespaces[ns] = {
            package: pkg,
            keyType: declaration.keyType,
            zh: bound.zh?.entries ?? {},
            en: bound.en?.entries ?? {},
          }
          continue
        }
        orphans.push(
          `${pkg}: ${ns} declares key type ${declaration.keyType ?? `"keyof typeof ${declaration.local}"`} `
          + 'but no dictionary carries it',
        )
        continue
      }
      namespaces[ns] = {
        package: pkg,
        keyType: declaration.keyType,
        zh: zh?.entries ?? {},
        en: en?.entries ?? {},
      }
    }
  }
  return { namespaces, unreadable, orphans }
}

/**
 * Read one named dictionary literal out of a source file — this package's own
 * `export const ja = { ... }`, which the upstream scanner above deliberately
 * ignores (its marker matches only the two names upstream ships).
 * @param file - path to the .ts file.
 * @param name - the exported const's name.
 * @returns key -> text, empty when the file declares no such literal.
 */
export async function readOwnDictionary(file, name) {
  const source = stripComments(await readFile(file, 'utf8'))
  const marker = new RegExp(`export\\s+const\\s+${name}\\s*(?::[^=]+?)?\\s*=\\s*\\{`)
  const match = marker.exec(source)
  if (match === null) return {}
  const open = match.index + match[0].length - 1
  const body = block(source, open)
  if (body === null) return {}
  return flatMap(body, stringConstants(source)).entries
}
