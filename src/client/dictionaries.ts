/**
 * The back-fill corpus: CJK dictionaries for namespaces this plugin does not
 * own.
 *
 * Upstream client packages register `{ zh, en }` for their own namespaces and
 * have no idea this plugin exists, so their Japanese, Korean and Traditional
 * Chinese strings have to arrive from outside. They are authored as flat JSON
 * under `dict/<locale>/<namespace>.json` and assembled into one module by
 * `scripts/assemble-dicts.mjs`, because a browser bundle cannot glob a
 * directory at runtime.
 *
 * Keys absent here still resolve — English, or converted Simplified for
 * zh-TW. That is the design, not a gap: `scripts/verify-dicts.mjs` is what
 * decides whether a gap is acceptable, by diffing this corpus against the
 * pinned upstream dictionaries.
 */

import generated from './backfill.generated.json' with { type: 'json' }

/** Dictionaries for one locale, keyed by namespace. */
type NamespaceDicts = Record<string, Record<string, string>>

/** The assembled corpus: locale id -> namespace -> key -> text. */
export const BACKFILL: Record<string, NamespaceDicts> = generated
