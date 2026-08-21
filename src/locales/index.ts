/**
 * The common-namespace dictionaries. zh is the key-set source of truth
 * (upstream's convention, kept so a fork diff stays readable); every other
 * locale is checked complete against it — a missing or extra key is a
 * compile error.
 */
export { zh } from './zh.ts'
export { en } from './en.ts'
export { zhTW } from './zh-tw.ts'
export { ja } from './ja.ts'
export { ko } from './ko.ts'
export type { CommonKey } from './zh.ts'
