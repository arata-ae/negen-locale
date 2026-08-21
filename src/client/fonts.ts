/**
 * Repair of the theme's font stacks, the fork's one deviation outside the
 * dictionaries.
 *
 * Upstream's `--dsw-font-family` names `PingFang SC`, `Hiragino Sans GB` and
 * `Microsoft YaHei` — three Simplified Chinese faces and nothing for any other
 * language. Han characters are unified in Unicode but not in type (直 骨 海 者
 * are drawn differently in each), so a Japanese or Korean reader gets Chinese
 * letterforms throughout. `<html lang>` cannot correct it: a named family that
 * covers the character satisfies it before language-aware fallback ever runs.
 *
 * The repair is subtractive. Chromium picks the fallback face from the
 * element's language, so removing the Chinese families from the stack is
 * enough — and it is strictly better than naming the right family per
 * language, because a named family pins one face regardless of what the text
 * actually is, while fallback also gets embedded foreign text right. Measured
 * in Electron 43 on macOS 27 over 直骨海者: upstream renders one raster for
 * `ja`, `ko`, `zh-CN` and `en`; without the Chinese families the four
 * languages render four distinct, correct rasters. This is why
 * {@link syncDocumentLanguage} is load-bearing rather than cosmetic.
 *
 * The Latin head stays exactly as upstream wrote it, so Latin text is
 * untouched on every platform.
 */

import { injectStyleTag } from './style-tag.ts'

/** Marker on the injected tag. */
const TAG = 'negen-locale-fonts'

/**
 * Upstream's two stacks, with the Simplified Chinese families removed and
 * nothing else changed.
 *
 * The code stack keeps upstream's missing generic terminator, which reads like
 * an oversight and is not: measured here, appending `monospace` or
 * `ui-monospace` collapses all four languages back to one raster, because the
 * generic resolves to a single fixed CJK face and so satisfies the character
 * the same way a named family does. No terminator leaves the last-resort
 * fallback to Chromium, which does consult the language.
 */
export const FONT_CSS = `:root:root {
  --dsw-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif;
  --ds-font-family-code: 'SF Mono', 'JetBrains Mono', 'Fira Code', Consolas, 'Liberation Mono', Menlo, Courier;
}`

/**
 * Install the override.
 *
 * The selector repeats `:root` to outrank the plain `:root` upstream declares
 * these variables on, so a theme stylesheet that loads after this plugin
 * activates cannot take them back — the cascade decides on specificity rather
 * than on which of the two happened to arrive first.
 * @returns a disposer removing the tag this call appended (idempotent).
 */
export function installFontFallback(): () => void {
  return injectStyleTag(TAG, FONT_CSS)
}
