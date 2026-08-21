/** `settings.locale` namespace dictionaries (the Language row's copy). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'language.title': '语言',
} satisfies Record<string, string>

/** The settings.locale namespace key union. */
export type SettingsLocaleKey = keyof typeof zh

/** Traditional Chinese dictionary. */
export const zhTW = {
  'language.title': '語言',
} satisfies Record<SettingsLocaleKey, string>

/** Japanese dictionary. */
export const ja = {
  'language.title': '言語',
} satisfies Record<SettingsLocaleKey, string>

/** Korean dictionary. */
export const ko = {
  'language.title': '언어',
} satisfies Record<SettingsLocaleKey, string>

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'language.title': 'Language',
} satisfies Record<SettingsLocaleKey, string>
