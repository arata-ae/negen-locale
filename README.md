# @negen/locale

Traditional Chinese, Japanese and Korean for the DeepSeek Harness Web UI.

A language pack: it **extends** the built-in locale plugin rather than replacing it. Install it, reload the window, and the three languages appear in Settings → General beside the two the harness ships.

## Install

```sh
dsh plugin --profile <name> add github:arata-ae/negen-locale
```

`<name>` is the profile you actually run — `desktop` for the desktop app. The bundled CLI is at `/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh`.

## Languages

| Id | Label | Source |
| --- | --- | --- |
| `zh` | 简体中文 | built in, unchanged |
| `zh-TW` | 繁體中文 | this package |
| `ja` | 日本語 | this package |
| `ko` | 한국어 | this package |
| `en` | English | built in, unchanged |

All three are complete at the pin: 2435 keys each, across 55 namespaces — the 54 the harness ships, plus `archive`, whose owner lives in its own repository and is read as a sibling checkout (see below). Plugins with no corpus here are outside it, so their namespaces render English under `ja` and `ko`, and Simplified — not converted — under `zh-TW`.

## Why it does not replace the built-in plugin

It used to, and at DSH 0.2.0 that stopped being possible. A durable settings section is keyed by its profile row id, a Loader patch cannot rename a row, and the desktop app resolves the copy it opens with by finding a namespace named `locale` — a composition that disables or re-owns that row is an app that will not boot. [UPSTREAM.md](UPSTREAM.md) has the whole argument, including what this package gives up by not being a fork (the zh-TW conversion rung).

Because the row is untouched, a language preference you already had keeps working.
