#!/usr/bin/env node
/**
 * Run both gates against one checkout.
 *
 * A shell `&&` chain cannot do this: `pnpm verify -- <path>` appends the
 * argument to the end of the whole chain, so only the last command in it ever
 * sees the path while the earlier one silently falls back to its own search.
 * One script, one argv, forwarded to both.
 *
 * Usage: node scripts/verify.mjs [path/to/deepseek-harness]
 */

import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = resolve(dirname(fileURLToPath(import.meta.url)))
// `--` is pnpm's separator, not an argument; harnessRoot skips it too, but
// forwarding it would leave the child's argv misleading in error messages.
const args = process.argv.slice(2).filter(argument => argument !== '--')

let failed = 0
for (const gate of ['verify-fork.mjs', 'verify-dicts.mjs']) {
  const result = spawnSync('node', [join(here, gate), ...args], { stdio: 'inherit' })
  if ((result.status ?? 1) !== 0) failed += 1
}
process.exit(failed === 0 ? 0 : 1)
