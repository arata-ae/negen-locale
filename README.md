# @negen/locale

Traditional Chinese, Japanese and Korean for the DeepSeek Harness Web UI.

The Harness ships two languages, Simplified Chinese and English, and its locale roster is closed: `LOCALE_IDS` is a frozen pair, `setLocale` throws on anything else, and the durable settings schema validates against the same union. None of it is extensible from outside the package. So this is not a plugin that extends the built-in one — it **replaces** it, and adds three languages to the roster it now owns.

[UPSTREAM.md](UPSTREAM.md) records the fork point, why a fork rather than a patch, and every deviation.

## Install

The repository is private, so install over SSH — pnpm shells out to git, which uses your own key. No token ends up in any file.

```sh
dsh plugin --profile web add git+ssh://git@github.com/arata-ae/negen-locale.git
```

While working on it, install the checkout instead. `link:` symlinks rather than copies, so a rebuild is live in the next window reload:

```sh
dsh plugin --profile web add link:../negen-locale
```

To remove, by package name either way:

```sh
dsh plugin --profile web remove @negen/locale
```

`dsh plugin` is a thin pnpm forwarder, so any specifier pnpm understands works here — including the plain HTTPS URL if this repository is ever made public.

The bundle patch disables the built-in `locale` row and inserts this one in its place, so the Language row in Settings → General is this package's. Any preference the built-in plugin already stored still resolves: the settings namespace, the field, and the `zh` / `en` ids are unchanged, and a widened union accepts everything the narrow one did.

## Languages

| Id | Label | Source |
| --- | --- | --- |
| `zh` | 简体中文 | built in, unchanged |
| `zh-TW` | 繁體中文 | this package |
| `ja` | 日本語 | this package |
| `ko` | 한국어 | this package |
| `en` | English | built in, unchanged |

Simplified Chinese needs nothing from this package: every upstream client package registers its own `zh` dictionary, and dropping the language from the roster would only make those strings unreachable.

## What is translated, and what falls back

Every client package in the Harness registers `{ zh, en }` for its own namespaces and knows nothing about this one, so all CJK text lives here in `dict/<locale>/<namespace>.json` and is registered onto their namespaces at boot. `pnpm verify:dicts` prints the counts and reports anything upstream has added since.

A key with no translation still renders — which is what a new upstream key does until someone gets to it. The chain, per key:

1. the curated string for the active locale
2. **zh-TW only** — the Simplified string, rewritten through an 838-character conversion table
3. English
4. the key itself, so missing text is visible rather than blank

Rung 2 is why Traditional Chinese needs far fewer curated strings than the other two: upstream ships `zh` for every namespace, and converting it beats dropping a Chinese reader onto English. It is a fallback and never overrides a curated string, because character conversion cannot reach vocabulary — Taiwan writes 搜尋, and no table turns 搜索 into it.

Third-party plugins are outside this. Their namespaces render English under `ja` and `ko`, and convert under `zh-TW` like everything else.

Some text stays English by upstream's own decision and this package keeps it that way: error strings, tool-row titles, the stats line, and all of `ui-trajectory`.

## Maintaining it

Two gates, both reading a real harness checkout rather than a vendored copy. Point them at one:

```sh
pnpm verify ../deepseek-harness
```

`verify:fork` hashes the eleven upstream files this package forked or overrides and checks five upstream seams — the browser module table, `installLocale`, `LocaleFace`, the theme's font variables, and the id of the row the patch disables. A change is a prompt to read the diff, not automatically a break.

`verify:dicts` diffs the translation corpus against upstream's own dictionaries. It fails on translations that no longer match: a key reworded upstream, a key removed, a namespace gone. New upstream keys are reported rather than failed — they render English, which is the design.

Neither is optional. Without them this decays into a half-English UI one pin advance at a time, and nothing else would say so.

```sh
pnpm build          # both halves into lib/, host declarations included
pnpm test           # unit tests and gate behaviour
pnpm typecheck
pnpm chars          # characters upstream uses that the zh-TW table leaves alone
```

`verify:dicts` also judges zh-TW wording, because a string can be perfectly Traditional and still read as mainland Chinese — 文件 for a file, 插件 for a plugin, 後台 for background. [scripts/lib/zh-tw-terms.mjs](scripts/lib/zh-tw-terms.mjs) is the table that decides. An uncovered key that trips it is a report, since it renders converted text either way; a curated string that trips it is a failure, because somebody wrote that text on purpose.

`lib/` is committed on purpose: `dsh plugin add` installs this repository straight from git, with no build step on the far side.

## Adding a translation

Add or extend `dict/ja/<namespace>.json` — a flat map of key to text, where the filename is the namespace. Keep `{placeholder}` tokens exactly as they appear in the English string. Run `pnpm verify:dicts` before committing; it rejects a key upstream does not have, which is usually a typo in the key rather than a new string.

Two namespaces are not in `dict/`: `common` and `settings.locale` live in `src/locales/` as TypeScript, because this package owns them outright and the compiler checks every locale complete against the zh key set.

Coverage at the pinned release: ja 671/671, ko 671/671, zh-TW 382 curated with the remaining 289 converting cleanly from zh. Advancing the pin is what makes those numbers move, and `pnpm verify:dicts` is what tells you by how much.
