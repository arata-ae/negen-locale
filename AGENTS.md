# AGENTS.md

`@negen/locale` adds Traditional Chinese, Japanese and Korean to the DeepSeek Harness Web UI. It is a Negen-suite package that happens to live in its own repository, not a community DSH plugin.

## The thing to understand first

This package **extends** the built-in locale plugin; it used to replace it. [UPSTREAM.md](UPSTREAM.md) records what it contributes, what it gave up when it stopped being a fork, and the desktop-app constraint that forced the change. Read it before changing anything under `src/`, and add to it when you deviate further — a deviation nobody wrote down gets "cleaned up" by the next reader.

Two gates keep the record true, and neither is optional maintenance:

```sh
pnpm verify        # both of them, against one checkout
```

`verify:fork` hashes the upstream file this package overrides and checks the seams it consumes. `verify:dicts` diffs the translated corpus against upstream's own dictionaries. Without them this decays into a half-English UI one pin advance at a time, silently. [README.md](README.md) owns the detail.

`--write` on either gate re-records a baseline. Only ever run it because the pin actually moved, never to make a red gate green.

## Standing rules

- **Never own, rename or disable the `locale` row.** The desktop app finds the settings namespace named `locale` to resolve the copy it opens with, and throws when it is missing — an app that does not boot. This package inserts a row of its own *beside* the built-in one and touches nothing. `scripts/verify-fork.mjs` carries the seam; [UPSTREAM.md](UPSTREAM.md#why-it-is-not-a-fork-any-more) explains why owning that namespace is not merely discouraged but unreachable.
- **A namespace owned outside the harness is named in `scripts/lib/foreign.mjs`.** The dictionary gate's namespace list comes from the harness checkout, so a corpus file for a plugin repository's namespace is invisible without an entry there: a key its owner adds renders English forever and one its owner retires leaves a translation answering nothing. The entry names a probe path, so a same-named unrelated directory is skipped; a checkout that is missing is a note in the gate's output, never a failure, because reporting it as a retired namespace is what invites deleting a live corpus.
- **The harness checkout is read-only.** Both gates point at one. Never edit a file there to make a gate pass — the gate is reporting that upstream moved, which is information, not an obstacle.
- **i18n is a product requirement.** Never propose narrowing the roster or shipping English-only. A scope cut named for what this package *adds* does not touch `zh` and `en`, which upstream already ships.
- **`lib/` is committed on purpose.** `dsh plugin add <git-url>` installs this repository straight from git with no build step on the far side, so a source change nobody rebuilt ships the previous version. Run `pnpm build` in the same commit.
- **The theme font override is deliberate and measured**, including the code stack's missing generic terminator. [src/client/fonts.ts](src/client/fonts.ts) records what each apparent omission buys; adding a font family or a `monospace` back undoes it. Re-measure before disagreeing.
- **The browser bundle is UTF-8, not ASCII-escaped.** It is mostly CJK text, and the harness serves plugin bundles as `text/javascript; charset=utf-8`. The build fails if the dictionaries do not survive the round trip.
- **A test earns its place by failing.** Break what it guards and watch it go red before trusting it.
- **Comments and JSDoc follow upstream's register**, because the seams this package sits on are read against their source. State the contract and the non-obvious constraint; do not narrate control flow.

## Layout

| Path | What it owns |
| --- | --- |
| `src/` | the plugin: a no-op host half at `index.ts`, the language pack under `client/` |
| `src/client/languages.ts` | the roster this package adds: id, label, fallback |
| `src/client/index.ts` | the whole plugin body: `addLanguage`, `register`, font repair |
| `dict/` | the corpus and the zh-TW character table. The corpus is the work |
| `scripts/` | the build and the two gates |
| `scripts/lib/foreign.mjs` | checkouts read beside the harness, for namespaces they own |
| `fork-point.json` | the pinned upstream commit and the one file hash the fork gate compares |

`pnpm build` assembles `dict/` into a generated module, bundles both halves, and emits host declarations.

`dict/` is authored, not generated — the translations are the work, and `dict/zh-tw-chars.json` is hand-curated (`pnpm chars` reports what the table misses, it never writes). `dict/upstream.snapshot.json` is machine-written by `verify-dicts --write`, but it is a recorded baseline like `fork-point.json` and belongs in the repository for the same reason. The generated artifact is `src/client/backfill.generated.json`, which is ignored. None of `dict/` ships in the published package: esbuild inlines it into `lib/client.js`, so nothing reads it at runtime.
