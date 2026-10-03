/**
 * Host half: a bundle row loads both halves of its package, so this entry has
 * to exist and be a valid Cordis plugin — and it deliberately does nothing.
 *
 * Everything durable this package used to own on the Host side is gone. Since
 * 0.2.0 the settings service reads a plugin's schema off its own runtime
 * `Config` export and keys the durable section by the profile row id, so
 * owning a `locale` preference means owning a row named `locale` — and that
 * row belongs to the built-in plugin. The desktop app resolves its welcome
 * copy by looking for exactly that namespace, which makes a second owner of it
 * an app that will not boot rather than a style question. See UPSTREAM.md.
 */
/** Cordis plugin name. */
export declare const name = "negen-locale";
/** No Host-side state; the browser half carries every contribution. */
export declare function apply(): void;
