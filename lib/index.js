// src/locale-settings.ts
var LOCALE_SETTINGS_NAMESPACE = "locale";
var LOCALE_PREFERENCE_FIELD = "preference";
var LOCALE_IDS = ["zh", "zh-TW", "ja", "ko", "en"];
var LOCALES = Object.freeze([
  { id: "zh", label: "\u7B80\u4F53\u4E2D\u6587" },
  { id: "zh-TW", label: "\u7E41\u9AD4\u4E2D\u6587" },
  { id: "ja", label: "\u65E5\u672C\u8A9E" },
  { id: "ko", label: "\uD55C\uAD6D\uC5B4" },
  { id: "en", label: "English" }
]);
var FALLBACK_LOCALE = "en";
var CONVERT_FALLBACK = { "zh-TW": "zh" };
var DOCUMENT_LANGUAGE = {
  "zh": "zh-CN",
  "zh-TW": "zh-TW",
  "ja": "ja",
  "ko": "ko",
  "en": "en"
};

// src/settings-schema.ts
import z from "@deepseek-ai/schemastery";
var LocaleSettingsSchema = z.object({
  [LOCALE_PREFERENCE_FIELD]: z.string().required(false)
});

// src/index.ts
var name = "negen-locale";
function apply(ctx) {
  ctx.inject(["settings"], (settingsCtx) => {
    settingsCtx.settings.register(
      LOCALE_SETTINGS_NAMESPACE,
      LocaleSettingsSchema
    );
  });
}
export {
  CONVERT_FALLBACK,
  DOCUMENT_LANGUAGE,
  FALLBACK_LOCALE,
  LOCALES,
  LOCALE_IDS,
  LOCALE_PREFERENCE_FIELD,
  LOCALE_SETTINGS_NAMESPACE,
  LocaleSettingsSchema,
  apply,
  name
};
//# sourceMappingURL=index.js.map
