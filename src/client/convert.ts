/**
 * Single-character Simplified to Traditional conversion, the last rung of the
 * zh-TW fallback chain.
 *
 * Deliberately character-level and nothing more: no phrase table, no
 * context. It runs only on a key that has no curated zh-TW string, where the
 * alternative is showing Simplified text or English. Vocabulary differences
 * (载入/載入, 保存/儲存, 搜索/搜尋) are exactly what this cannot fix, which is
 * why curated dictionaries come first and this never overrides one.
 *
 * `{name}` placeholders survive untouched — they hold no Han characters.
 */

import table from '../../dict/zh-tw-chars.json' with { type: 'json' }

const CHARS: Record<string, string> = table

/** Characters the table can rewrite, for the fast path below. */
const CONVERTIBLE = new Set(Object.keys(CHARS))

/** How many characters the shipped table covers. */
export const CHAR_TABLE_SIZE = CONVERTIBLE.size

/**
 * Rewrite Simplified characters to their Traditional forms.
 * @param text - source string, typically a zh dictionary value.
 * @returns the converted string, or `text` itself when nothing matched.
 */
export function convertZhTw(text: string): string {
  let needed = false
  for (const ch of text) {
    if (CONVERTIBLE.has(ch)) {
      needed = true
      break
    }
  }
  // Most strings in a converted namespace still contain no mapped character;
  // returning the original keeps the hot path allocation-free.
  if (!needed) return text
  let out = ''
  for (const ch of text) out += CHARS[ch] ?? ch
  return out
}
