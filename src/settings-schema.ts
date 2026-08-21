/**
 * The durable locale schema. Host-only: keeping it out of `locale-settings.ts`
 * is what keeps schemastery out of the browser bundle.
 */

import z from '@deepseek-ai/schemastery'
import { LOCALE_PREFERENCE_FIELD, type LocaleSettings } from './locale-settings.ts'

/**
 * Durable locale schema; also the wire envelope the browser scope validates
 * against.
 *
 * The field is a plain string rather than a union of the shipped locale
 * ids, which is the one place this deviates from the built-in plugin's schema.
 * Both write the same document key, so a home that ran the harness in a
 * language this fork does not ship already has that id on disk; a union would
 * reject the whole section and lose the rest of it. LocaleRuntime narrows on
 * adoption instead, where an unshipped id falls back to the browser-derived
 * locale without discarding anything.
 */
export const LocaleSettingsSchema: z<LocaleSettings> = z.object({
  [LOCALE_PREFERENCE_FIELD]: z.string().required(false),
})
