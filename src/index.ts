/** Host registration for the browser locale preference. */

import type { Context } from '@deepseek-ai/cordis'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import { LOCALE_SETTINGS_NAMESPACE } from './locale-settings.ts'
import { LocaleSettingsSchema } from './settings-schema.ts'

export {
  CONVERT_FALLBACK, DOCUMENT_LANGUAGE, FALLBACK_LOCALE, LOCALE_IDS, LOCALES,
  LOCALE_PREFERENCE_FIELD, LOCALE_SETTINGS_NAMESPACE,
  type LocaleDefinition, type LocaleId, type LocaleSettings,
} from './locale-settings.ts'
export { LocaleSettingsSchema } from './settings-schema.ts'

/** Cordis plugin name. */
export const name = 'negen-locale'

/**
 * Register the durable locale section when a settings provider exists. The
 * namespace and field match the built-in plugin's, so this reads and writes
 * the same document key — a home that already ran the built-in plugin keeps
 * its selection, and one whose stored id this roster does not ship falls back
 * rather than failing to load.
 * @param ctx - Host context whose optional settings service owns the section.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(
      settingsNamespace(LOCALE_SETTINGS_NAMESPACE),
      LocaleSettingsSchema,
    )
  })
}
