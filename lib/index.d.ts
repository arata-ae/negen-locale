/** Host registration for the browser locale preference. */
import type { Context } from '@deepseek-ai/cordis';
export { CONVERT_FALLBACK, DOCUMENT_LANGUAGE, FALLBACK_LOCALE, LOCALE_IDS, LOCALES, LOCALE_PREFERENCE_FIELD, LOCALE_SETTINGS_NAMESPACE, type LocaleDefinition, type LocaleId, type LocaleSettings, } from './locale-settings.js';
export { LocaleSettingsSchema } from './settings-schema.js';
/** Cordis plugin name. */
export declare const name = "negen-locale";
/**
 * Register the durable locale section when a settings provider exists. The
 * namespace and field match the built-in plugin's, so this reads and writes
 * the same document key — a home that already ran the built-in plugin keeps
 * its selection, and one whose stored id this roster does not ship falls back
 * rather than failing to load.
 * @param ctx - Host context whose optional settings service owns the section.
 */
export declare function apply(ctx: Context): void;
