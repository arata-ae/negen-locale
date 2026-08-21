import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { FONT_CSS } from '../src/client/fonts.ts'

/**
 * Families that carry Han glyphs. Naming any of them satisfies a kanji before
 * language-aware fallback runs, which is the bug this module exists to undo —
 * a Chinese family is the observed case, but any of them pins one language's
 * letterforms onto every language.
 */
const HAN_FAMILIES = /PingFang|Hiragino|YaHei|JhengHei|SimSun|SimHei|Yu Gothic|Meiryo|Malgun|Gothic Neo|Noto Sans (SC|TC|JP|KR)|Source Han/i

test('the override names no Han-bearing family', () => {
  assert.equal(HAN_FAMILIES.test(FONT_CSS), false, FONT_CSS)
})

// Whether upstream still declares exactly these two is a fork-drift question,
// so verify-fork owns it (base.css is hashed and both names are seams there).
test('it overrides both theme font variables', () => {
  assert.match(FONT_CSS, /--dsw-font-family:/)
  assert.match(FONT_CSS, /--ds-font-family-code:/)
})

// Source order must not decide this: the theme stylesheet may load after the
// plugin activates, and a plain `:root` would then take the variables back.
test('the selector outranks a plain :root', () => {
  assert.match(FONT_CSS, /^:root:root\s*\{/)
})

// A generic monospace resolves to one fixed CJK face, so it satisfies a kanji
// before language-aware fallback runs — the same failure the named families
// caused. The text stack's `sans-serif` is harmless because a family ahead of
// it always matches first on every platform this ships to.
test('the code stack ends in no generic family', () => {
  const code = /--ds-font-family-code:([^;]*);/.exec(FONT_CSS)?.[1] ?? ''
  assert.doesNotMatch(code, /\b(monospace|ui-monospace)\b/)
})
