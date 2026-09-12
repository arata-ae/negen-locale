# Upstream

This package is a fork of one DeepSeek Harness package. It is not a wrapper, a patch, or a plugin that extends the original — it replaces it.

| | |
| --- | --- |
| Upstream | [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) |
| Forked package | `packages/client/locale` (`@deepseek-ai/dsh-client-locale`) |
| Fork point | tag `dsh-v0.1.5-rc.2`, commit `fb2c4b9e698e30edb738bca4cf0618587db7d203` |
| Upstream license | MIT |

## Why a fork and not a plugin

At the original fork point the built-in locale plugin owned a roster that was closed at three points, none of them reachable from outside the package:

1. `LOCALE_IDS` is a frozen `['zh', 'en']`, and the selectable roster is a module-private `Object.freeze`d array. `setLocale` throws on any id not in it, and `publish` carries the same array forward on every change, so the roster cannot grow after construction. There is no `registerLocale`.
2. `LocaleSettingsSchema` validates the durable preference against that same union, so no other id can be persisted.
3. `ctx.slots.installLocale` is boot-once and throws on a second install, so a second locale face cannot stand beside the built-in one.

**Two of the three are gone at `dsh-v0.1.5-rc.2`.** Upstream added `ctx.locale.addLanguage({ id, label, fallback })` — a public extension point documented as the language-pack recipe — moved the durable field to `z.string().pattern(LOCALE_ID_PATTERN)` instead of a union, and widened `LocaleId` to `string`. A language pack can now register a wider roster without touching a private member, which is the case this fork was cut to answer.

What still cannot be reached from outside is the **zh-TW conversion rung**: `lookup` falls a missing `zh-TW` key through Simplified and converts the characters before dropping to English, and `CONVERT_FALLBACK` is the table of which pairs have that rung. `addLanguage` takes a fallback id and nothing else, so a plugin inherits a plain Simplified string where this package renders Traditional. Re-costing the fork means moving that rung into the build — generating converted `dict/zh-TW/` entries from the zh corpus — which would make the build depend on a harness checkout it deliberately does not read today. That trade is open; until it is made, the fork is the only shape that carries the rung.

A plugin can also reach past the closed roster by writing to the live service's private fields — that is what [asd13006/dsh-multi-lang-ui](https://github.com/asd13006/dsh-multi-lang-ui) did, reassigning `snapshot`, calling `publish`, reading `dicts`, and wrapping `translate` and `adopt`. It works. It is also coupled to five private members by name, with every patch site wrapped in a `catch` that logs, so the failure mode after an upstream refactor is a UI that quietly reverts to English.

Forking the whole harness was the other way to reach them, and it costs more than it looks. Negen ships the harness as a runtime dependency — a submodule pinned to one tag — so forking it means Negen can never take an upstream release cleanly again, and every unrelated change across a fifty-package monorepo becomes a merge to own. What this package owns instead is eleven files and five seams, and the whole cost of a release is whatever `verify:dicts` lists. A bounded surface that the gates measure beats an unbounded one nobody does.

This fork keeps the coupling on the **public** service API instead: `getLocale`, `getSnapshot`, `subscribe`, `setLocale`, `register`, `bind`, plus the `LocaleFace` contract from `ui-slots`. Every upstream client package consumes that same surface, so upstream cannot break it without breaking itself.

## What changed

- **`LOCALE_IDS` widened** to `['zh', 'zh-TW', 'ja', 'ko', 'en']`, and `LOCALES` moved out of a module-private const into `locale-settings.ts` where the roster is data rather than a secret.
- **Settings namespace and field are unchanged** (`locale` / `preference`). Widening a union is backward compatible, so a preference the built-in plugin wrote still resolves.
- **The durable field is a plain string, not a union.** Upstream validates the preference against `LOCALE_IDS`; here that would reject the stored id of any home that ran a build of this plugin with a wider roster, and take the rest of the section down with it. `LocaleRuntime.adopt` narrows instead: an unshipped id is treated as absent, left on disk, and the browser's own language decides. Restoring the language restores the selection.
- **The schema moved** to its own `settings-schema.ts`. It was the only reason the browser bundle pulled in schemastery; the constants it sat next to are needed on both halves and the schema is needed on neither.
- **`lookup` gained a rung.** A zh-TW read with no curated string falls to the Simplified value and character-converts it before dropping to English. `CONVERT_FALLBACK` is the table of which locale pairs have such a rung; only zh-TW/zh does. A curated string always wins over a converted one.
- **`detectBrowserLocale` reads script and region**, not just the primary subtag. Upstream's version cannot separate `zh-Hant-TW` from `zh-Hans-CN` — both reduce to `zh`.
- **`DOCUMENT_LANGUAGE`** carries five entries; both Chinese variants name their script region.
- **`register`'s typed overload requires only `en`** rather than every shipped locale. Upstream's all-locales-required shape is checkable when there are two locales and everything in the tree ships both; it is not when three of the five arrive from a different package than the namespace's owner.
- **The back-fill loop is new.** Upstream packages register `{ zh, en }` for their own namespaces, so their CJK strings arrive from `dict/` through the untyped single-locale `register(ns, locale, dict)` form. `(ns, locale)` is the occupancy key, and `ja` on someone else's namespace is unoccupied.
- **CSS Modules dropped.** Upstream hashes `LanguageRow.module.css` through a tsdown preset that only runs inside its monorepo. The declarations are copied verbatim, tokens included, into `client/styles.ts` behind prefixed literal class names.
- **The client entry was split into four modules.** Upstream keeps the runtime class, the browser-language detection, the row and the plugin body in one `client/index.ts`. Here they are `runtime.ts`, `detect.ts`, `LanguageRow.tsx` and `index.ts`, because the first two carry the logic worth testing and upstream's layout puts React in their import graph — importing `LocaleRuntime` to check its fallback chain should not drag in the render stack. The code inside them is unchanged.
- **The theme's font stacks are overridden**, the one change that reaches outside the forked package. Upstream's `--dsw-font-family` names `PingFang SC`, `Hiragino Sans GB` and `Microsoft YaHei`; because Han characters are unified in Unicode but not in type, a named Chinese family satisfies every kanji before language-aware fallback can run, and Japanese and Korean read in Chinese letterforms. `client/fonts.ts` redefines both variables from the cascade with the Chinese families removed and nothing added — measured in Electron 43 on macOS, that alone turns one shared rendering for `ja`, `ko` and `zh-CN` into three correct ones, because Chromium picks the fallback face from `<html lang>`. Naming the right family per language was measured too and is worse: it pins one face regardless of what the text is. The code stack keeps upstream's missing generic terminator for the same reason — appending `monospace` collapses the four languages back to one.
- **The invariant companion is dropped.** Upstream's `invariant.ts` installs nothing (`const install: InvariantInstaller = () => {}`); it exists to reserve package ownership in their registry, which is not ours to reserve.

## What deliberately did not change

The lookup chain, the revision/publish lifecycle, the `locale/change` event's contract (registrations stay off it), the boot-once install discipline, `LanguageRow`, and `settings-store.ts` are upstream's, verbatim or near enough to diff. Keeping them that way is what makes `pnpm verify:fork` able to tell you when upstream moves.

## Re-base to `dsh-v0.1.5-rc.2`

The pin moved four seams this package sits on, all of them the harness reorganising rather than changing what it promises:

- **`@deepseek-ai/dsh-client-runtime` was deleted.** `defineStore` moved to `@deepseek-ai/dsh-client-store`, `SettingsScope` to `@deepseek-ai/dsh-client-ui-settings/client`, `ClientContext` to cordis itself, and `ctx.slots` with `installLocale` to `@deepseek-ai/dsh-client-ui-renderer`. The browser module table in `scripts/build.mjs` follows the shell's `PLATFORM_MODULES`, which now shares `dsh-client-store` and `dsh-client-ui-dockkit` and no longer preloads the runtime — a bundle that still required the old name would throw where nothing could read the error.
- **`settingsNamespace()` is gone.** The namespace is the literal string it always was.
- **The Language row syncs from `locale.subscribe`**, not from the `locale/change` event. The event fires only on an active-locale switch, so a catalog change moved the snapshot revision while the row kept the old list; the row's own revision guard made that a silent stale render once anything could add a language.
- **`scripts/lib/extract-dicts.mjs` reads all three declaration spellings.** Upstream now writes `import('../locale.ts').ChatKey` and `keyof typeof zh` beside the bare type name, and the scanner's single-identifier pattern read those as namespaces called `import` and `keyof`: `chat`, `sidebarDocumentPreview` and `sidebarCodePreview` — 124 keys — never reached the gate at all. They are the namespaces most in need of it, since nothing else names them either.

The dictionary corpus is re-based and complete. Going from the old pin's 28 namespaces and 671 keys to this one's 40 and 1168 meant reconciling three kinds of movement before any new text could be written:

- **65 translations moved to the key that inherited their English text.** `conversation` split into `chat` and `approval`, and most of its `message.*` keys kept their English verbatim under the new namespace. A translation of unchanged English is still correct, so it followed the key. Renames were decided by comparing English text, never key names: the same tail under a new namespace usually means something else entirely (`message.retry.cancelled` and `ask.cancelled` share a tail and nothing else).
- **35 were retired.** Their English exists nowhere upstream now, and the gate reads a translation of absent text as drift forever.
- **13 were rewritten** against source that was reworded — mount vocabulary became running vocabulary (`Mounted` → `Running`), "Produced" became "Files changed", and the minimal preset description dropped from two tools to one.

Then the missing keys were translated: ja 519, ko 519, zh-TW 604 curated plus 189 gate-flagged ones.

`scripts/lib/extract-dicts.mjs` needed two fixes to see the corpus it was measuring. A flat-map value can contain a comma — upstream's zh onboarding copy is a paragraph with several — and the `,`-delimited pattern read the tail of that sentence as a key, which is how `ui-settings-models` reported 100 English keys against **zero** Chinese ones while the Chinese text sat in the file. And that package's `zh` is annotated `{ [Key in keyof typeof en]: string }`, a mapped type the declaration reader did not recognise, so the namespace resolved to no dictionary at all. Both failed silently in the direction that looks like success: a namespace with no `zh` reads as fully translated because there is nothing to compare against.


## Staying current

`scripts/verify-fork.mjs` diffs the forked files — plus `ui-theme`'s `base.css`, which this package overrides rather than forks — against a checkout of the pinned tag, and fails on any upstream change to them. `scripts/verify-dicts.mjs` diffs the dictionary corpus against upstream's own dictionaries and fails when a key is added, removed, or reworded. Neither is optional maintenance: without them this decays into a half-English UI one pin advance at a time, silently.
