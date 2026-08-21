# AGENTS.md

`@negen/locale` replaces DeepSeek Harness's built-in locale plugin with a five-language roster: zh, zh-TW, ja, ko, en. It is a Negen-suite package that happens to live in its own repository, not a community DSH plugin.

## The thing to understand first

This is a fork, and a fork's whole job is staying honest about what it forked. [UPSTREAM.md](UPSTREAM.md) records the fork point, why replacement beat a plugin, and every deviation. Read it before changing anything under `src/`, and add to it when you deviate further — a deviation nobody wrote down gets "cleaned up" by the next reader.

Two gates keep the record true, and neither is optional maintenance:

```sh
pnpm verify        # both of them, against one checkout
```

`verify:fork` hashes the upstream files this package forked or overrides and checks the seams it consumes. `verify:dicts` diffs the translated corpus against upstream's own dictionaries. Without them this decays into a half-English UI one pin advance at a time, silently. [README.md](README.md#staying-current) owns the detail.

`--write` on either gate re-records a baseline. Only ever run it because the pin actually moved, never to make a red gate green.

## Standing rules

- **The harness checkout is read-only.** Both gates point at one (`vendors/deepseek-harness` inside a Negen clone by default). Never edit a file there to make a gate pass — the gate is reporting that upstream moved, which is information, not an obstacle.
- **i18n is a product requirement.** Never propose narrowing the roster or shipping English-only. A scope cut named for what this package *adds* does not touch `zh` and `en`, which upstream already ships.
- **`common` and `settings.locale` live in `src/locales/`, everything else in `dict/`.** They are registered in one typed call, so a `dict/` file for either would occupy the same `(namespace, locale)` twice and take the whole plugin down at boot. The build refuses it, and [tests/registration.test.ts](tests/registration.test.ts) refuses it again.
- **`lib/` is committed on purpose.** `dsh plugin add <git-url>` installs this repository straight from git with no build step on the far side, so a source change nobody rebuilt ships the previous version. Run `pnpm build` in the same commit.
- **The theme font override is deliberate and measured**, including the code stack's missing generic terminator. [src/client/fonts.ts](src/client/fonts.ts) records what each apparent omission buys; adding a font family or a `monospace` back undoes it. Re-measure before disagreeing.
- **The browser bundle is UTF-8, not ASCII-escaped.** It is mostly CJK text, and the harness serves plugin bundles as `text/javascript; charset=utf-8`. The build fails if the dictionaries do not survive the round trip.
- **A test earns its place by failing.** Break what it guards and watch it go red before trusting it.
- **Comments and JSDoc follow upstream's register**, because most of this file tree is meant to diff cleanly against theirs. State the contract and the non-obvious constraint; do not narrate control flow.

## Layout

| Path | What it owns |
| --- | --- |
| `src/` | the plugin: host half at `index.ts`, browser half under `client/` |
| `src/locales/` | the two namespaces this package owns outright, compile-checked complete |
| `dict/` | translations for namespaces upstream owns, plus the zh-TW character table and the upstream snapshot |
| `scripts/` | the build and the two gates |
| `fork-point.json` | the pinned upstream commit and the hashes both gates compare against |

`pnpm build` assembles `dict/` into a generated module, bundles both halves, and emits host declarations.

`dict/` is authored, not generated — the translations are the work, and `dict/zh-tw-chars.json` is hand-curated (`pnpm chars` reports what the table misses, it never writes). `dict/upstream.snapshot.json` is machine-written by `verify-dicts --write`, but it is a recorded baseline like `fork-point.json` and belongs in the repository for the same reason. The generated artifact is `src/client/backfill.generated.json`, which is ignored. None of `dict/` ships in the published package: esbuild inlines it into `lib/client.js`, so nothing reads it at runtime.
