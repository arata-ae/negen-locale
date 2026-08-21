# Upstream

This package is a fork of one DeepSeek Harness package. It is not a wrapper, a patch, or a plugin that extends the original — it replaces it.

| | |
| --- | --- |
| Upstream | [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) |
| Forked package | `packages/client/locale` (`@deepseek-ai/dsh-client-locale`) |
| Fork point | tag `dsh-v0.1.1-rc.2`, commit `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e` |
| Upstream license | MIT |

## Why a fork and not a plugin

The built-in locale plugin owns a roster that is closed at three points, none of them reachable from outside the package:

1. `LOCALE_IDS` is a frozen `['zh', 'en']`, and the selectable roster is a module-private `Object.freeze`d array. `setLocale` throws on any id not in it, and `publish` carries the same array forward on every change, so the roster cannot grow after construction. There is no `registerLocale`.
2. `LocaleSettingsSchema` validates the durable preference against that same union, so no other id can be persisted.
3. `ctx.slots.installLocale` is boot-once and throws on a second install, so a second locale face cannot stand beside the built-in one.

A plugin can reach past all three by writing to the live service's private fields — that is what [asd13006/dsh-multi-lang-ui](https://github.com/asd13006/dsh-multi-lang-ui) does, reassigning `snapshot`, calling `publish`, reading `dicts`, and wrapping `translate` and `adopt`. It works. It is also coupled to five private members by name, with every patch site wrapped in a `catch` that logs, so the failure mode after an upstream refactor is a UI that quietly reverts to English.

Forking the whole harness was the other way to reach them, and it costs more than it looks. Negen ships the harness as a runtime dependency — a submodule pinned to one tag — so forking it means Negen can never take an upstream release cleanly again, and every unrelated change across a fifty-package monorepo becomes a merge to own. What this package owns instead is eleven files and five seams, and that surface did not move at all between `dsh-v0.1.1-rc.1` and `rc.2`; the whole cost of that release was nine untranslated keys, which `verify:dicts` listed. A bounded surface that the gates measure beats an unbounded one nobody does.

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

## Staying current

`scripts/verify-fork.mjs` diffs the forked files — plus `ui-theme`'s `base.css`, which this package overrides rather than forks — against a checkout of the pinned tag, and fails on any upstream change to them. `scripts/verify-dicts.mjs` diffs the dictionary corpus against upstream's own dictionaries and fails when a key is added, removed, or reworded. Neither is optional maintenance: without them this decays into a half-English UI one pin advance at a time, silently.
