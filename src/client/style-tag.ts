/**
 * One `<style>` tag per marker, appended to the document head.
 *
 * Both stylesheets this package injects — the Language row's rules and the
 * theme font repair — need the same three things: skip non-browser runs, never
 * stack a second copy when a bundle re-evaluates, and come back out on
 * dispose. Upstream needs none of it, because its CSS Modules pipeline emits a
 * real stylesheet; the mechanism is this fork's, so it exists once.
 */

/**
 * Append a stylesheet, and remove it on dispose.
 *
 * The guard reads the tag's own marker rather than a module-local flag, so a
 * reloaded bundle (HMR, a second factory evaluation) cannot stack duplicates.
 * A call that finds one already there owns nothing, and its disposer is inert
 * — removing a tag this call did not append would strip the styles out from
 * under whoever did.
 * @param marker - `data-plugin` value identifying this stylesheet.
 * @param css - the stylesheet text.
 * @returns a disposer removing the tag this call appended (idempotent).
 */
export function injectStyleTag(marker: string, css: string): () => void {
  // Non-browser runs (node boots of the client tree) have no document.
  if (typeof document === 'undefined') return () => {}
  if (document.querySelector(`style[data-plugin="${marker}"]`) !== null) return () => {}
  const tag = document.createElement('style')
  tag.dataset.plugin = marker
  tag.textContent = css
  document.head.appendChild(tag)
  return () => { tag.remove() }
}
