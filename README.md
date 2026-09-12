# @negen/locale

Traditional Chinese, Japanese and Korean for the DeepSeek Harness Web UI.

The Harness ships Simplified Chinese and English, and its locale roster is closed. This package replaces the built-in `locale` plugin and adds three languages to the roster it now owns. [UPSTREAM.md](UPSTREAM.md) records the fork point and every deviation.

## Install

```sh
dsh plugin --profile web add github:arata-ae/negen-locale
```

Reload the window, then pick a language in Settings → General. A language preference you already had still resolves, and `zh` and `en` are unchanged.

## Languages

| Id | Label | Source |
| --- | --- | --- |
| `zh` | 简体中文 | built in, unchanged |
| `zh-TW` | 繁體中文 | this package |
| `ja` | 日本語 | this package |
| `ko` | 한국어 | this package |
| `en` | English | built in, unchanged |

All three are complete at the pin: 1168 of 1168 keys each, across 40 namespaces. Third-party plugins are outside the corpus, so their namespaces render English under `ja` and `ko`.
