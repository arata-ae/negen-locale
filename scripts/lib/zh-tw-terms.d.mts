/** Types for `zh-tw-terms.mjs`, so the gate's tests can import it from TypeScript. */

/** Mainland-in-Traditional to Taiwan word pairs, longest mainland form first. */
export declare const TERMS: readonly (readonly [string, string])[]

/** Characters with more than one Traditional form, which conversion leaves alone. */
export declare const AMBIGUOUS: RegExp

/**
 * Whether a Traditional string still reads as mainland Chinese.
 * @param converted - a Traditional string, converted or hand-written.
 * @returns true when mainland vocabulary or an ambiguous character remains.
 */
export declare function needsCuration(converted: string): boolean
