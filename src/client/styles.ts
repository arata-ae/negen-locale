/**
 * The Language row's stylesheet.
 *
 * The built-in plugin ships this as a CSS Module and lets upstream's tsdown
 * preset hash the class names. That preset only runs inside upstream's
 * monorepo, so this fork carries literal prefixed class names and its own
 * one-line injector instead — which removes lightningcss and the whole
 * virtual-module pipeline from the build. Every declaration below is copied
 * verbatim from upstream, tokens included, so the row still renders as the
 * Setting-Cell the surrounding section expects.
 */

import { injectStyleTag } from './style-tag.ts'

const PREFIX = 'negen-locale'

/** Class names the row applies, prefixed so they cannot collide with the shell's. */
export const styles = {
  row: `${PREFIX}-row`,
  rowText: `${PREFIX}-row-text`,
  title: `${PREFIX}-title`,
  selector: `${PREFIX}-selector`,
  chevron: `${PREFIX}-chevron`,
} as const

const CSS = `
.${styles.row} {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 0;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.${styles.rowText} {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-right: 48px;
}
.${styles.title} {
  font-size: 14px;
  font-weight: 400;
  line-height: 22px;
  color: var(--dsw-alias-label-primary);
}
.${styles.selector} {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  height: 36px;
  padding: 0 14px;
  border: none;
  border-radius: 18px;
  background: var(--dsw-alias-bg-module-platform);
  font: inherit;
  font-size: 14px;
  line-height: 22px;
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
}
.${styles.selector}:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.${styles.chevron} {
  flex: none;
}
`

/**
 * Install the row's stylesheet.
 * @returns a disposer removing the tag this call appended (idempotent).
 */
export function installStyles(): () => void {
  return injectStyleTag(PREFIX, CSS)
}
