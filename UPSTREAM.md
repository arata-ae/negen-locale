# Upstream

This package extends one DeepSeek Harness package. It used to *replace* it, and the reason it stopped is the most important thing in this file.

| | |
| --- | --- |
| Upstream | [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) |
| Extended package | `packages/client/locale` (`@deepseek-ai/dsh-client-locale`) |
| Pin | tag `dsh-v0.2.0-rc.2`, commit `639ed015397290b3745d163aafe02ffee4aa3f84` |
| Upstream license | MIT |

## What this package is now

A language pack. The built-in locale plugin ships Simplified Chinese and English, owns the roster, the durable preference, the Language row and the `locale` service. This package:

- widens that roster with `ctx.locale.addLanguage` — `zh-TW`, `ja`, `ko`;
- fills in those three languages for namespaces other packages own, through the untyped `ctx.locale.register(ns, locale, dict)` form, from a corpus of 2428 keys across 54 namespaces;
- repairs the theme's font stacks, which name Simplified Chinese families and would otherwise draw Japanese and Korean in Chinese letterforms.

It provides no service, owns no settings namespace, and registers no row. `src/client/index.ts` is the whole plugin.

## Why it is not a fork any more

The fork was cut at `dsh-v0.1.5-rc.2` for one reason. At that point the built-in plugin's roster was closed at three points, none reachable from outside: a frozen `LOCALE_IDS`, a durable schema validating against that same union, and a boot-once `installLocale`. Two of the three were already gone by the pin — upstream added `addLanguage`, moved the durable field to a pattern-validated string, and widened `LocaleId` to `string` — and the third, the zh-TW conversion rung, was the one that kept the fork honest: `addLanguage` takes a fallback *id*, so a language pack inherits a plain Simplified string where the fork rendered Traditional.

At `dsh-v0.2.0-rc.2` replacing the plugin stopped being possible at all, for a reason that has nothing to do with the roster:

- **A durable settings section is keyed by its profile row id.** `SettingsForms.describe()` publishes `ns: entry.options.id`, and `update(ns)` resolves a write by finding the row with that id. A plugin therefore does not choose its namespace; the row it is composed as does.
- **A patch cannot rename a row.** In the Loader dialect, a patch's truthy `name` *asserts* the plugin the row already names rather than replacing it. So a bundle that wanted the namespace `locale` would have to insert a second row with the id `locale` — and `entries().find(row => row.options.id === ns)` returns the first match, which is the built-in row it had just disabled. Reads would find a row with no fiber; writes would throw.
- **The desktop app requires that namespace by name.** `apps/desktop/src/welcome-backend.ts` resolves the copy it opens the app with through `namespaces.find(item => item.ns === 'locale')` and throws `desktop welcome: invalid locale preference` when it is absent. A composition that disables or re-owns the `locale` row is not a cosmetic problem: the window never boots.

That is why the row this package inserts is a *second* row rather than a replacement, why its patch contains no `disabled:` line, and why `scripts/verify-fork.mjs` carries a seam on `welcome-backend.ts`. The mistake was made once; the seam is so it cannot be made again quietly.

## What the pack gives up

- **The runtime conversion rung.** A zh-TW read with no curated value falls through to the `zh` dictionary and renders the *Simplified* string, because a fallback is an id and upstream exposes no way to convert on the way past. Two cases reach it: a third-party plugin's namespace, which no corpus of ours can know, and an upstream key added after the pin, which `verify-dicts.mjs` reports as untranslated. Everything the pinned upstream ships is curated, so the first case is the only standing one.
- **Owning the Language row and the preference.** The built-in plugin owns both. Its row renders whatever the catalog carries, so the three added languages appear in it unchanged; and because the namespace stays `locale`, a stored preference now survives a pin move instead of being orphaned by one.

## Re-base to `dsh-v0.2.0-rc.2`

The corpus grew from 40 namespaces and 1168 keys to 54 and 2428 — 1124 new keys, 387 retired, 40 reworded. `scripts/lib/extract-dicts.mjs` needed four fixes before it could see the corpus it was measuring, and three of them were hiding live translations rather than merely under-reporting:

- **Spread imports were invisible.** Upstream folds part of a dictionary in from a sibling module — `{ ...guideEn }`, `{ ...frequencyEn }`, `{ ...PRODUCT_NAMES }`. A key the gate cannot see reads as a key upstream *retired*, which is how a prune that trusts the gate deletes a translation for text still on screen. It hid 286 keys, `permission.access` among them.
- **`[ 'a', 'b' ].join('\n\n')` was unreadable**, and the scanner then read the `.join()` call as the next key. Upstream keeps its longest help copy this way.
- **A declaration whose dictionaries live in a sibling module looked like a namespace that had been deleted.** `permission.access` declares `keyof typeof accessEn` while `accessEn`/`accessZh` are exported by `locales.ts`; the register call — `{ zh: accessZh, en: accessEn }` — is the only thing that names the pair. Reading it also surfaced three namespaces this package had never seen: `shortcuts`, `shortcuts.layout`, `settings.sessionLog`.
- **`resolvePath` compiled raw source text as a regular expression** and threw on the first value it was handed that was not an identifier path.

`unreadable` went 14 → 0 and `orphans` 4 → 0, so the corpus the gate measures is the corpus upstream ships. 387 translations were retired, each checked against upstream source before deletion (the redesigned preset and plugin-settings pages account for most of them), and the reworded set was re-translated rather than re-recorded blind. Six mainland-vocabulary slips in the new zh-TW text were caught by the gate and fixed.

## Staying current

`scripts/verify-fork.mjs` hashes the one upstream file this package overrides — `ui-theme`'s `base.css`, whose font variables `src/client/fonts.ts` redefines — and checks five seams it consumes: the browser module table, the three locale-package extension points, the `locale` row this pack extends, and the desktop app's dependence on that row's namespace.

It used to hash eleven forked files. The nine locale-package entries came off the list when the package stopped forking it: there is nothing left to diff, and the seams are what carries the contract now.

`scripts/verify-dicts.mjs` diffs the translated corpus against the dictionaries its owners declare and fails when a key is added, removed, or reworded. Neither gate is optional maintenance: without them this decays into a half-English UI one pin advance at a time, silently.

The gate's namespace list otherwise comes from the harness checkout alone, which is why `scripts/lib/foreign.mjs` names the packages that own a namespace from outside it — today `negen-archive`, read as a sibling checkout. Without that entry `dict/*/archive.json` would be ungated: a key archive adds renders English in all three locales forever, and one it retires leaves a translation answering nothing, with no gate to say so. A sibling that is simply absent is reported as a note rather than a retired namespace, so a clone without it still verifies green.
