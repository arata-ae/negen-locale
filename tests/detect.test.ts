import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { matchTag } from '../src/client/detect.ts'

test('the two Chinese variants separate by script', () => {
  // The built-in plugin matches the primary subtag alone, which folds both of
  // these onto 'zh'. Separating them is the whole reason zh-TW can exist.
  assert.equal(matchTag('zh-Hant-TW'), 'zh-TW')
  assert.equal(matchTag('zh-Hans-CN'), 'zh')
  assert.equal(matchTag('zh-Hant'), 'zh-TW')
  assert.equal(matchTag('zh-Hans'), 'zh')
})

test('the two Chinese variants separate by region when no script is named', () => {
  assert.equal(matchTag('zh-TW'), 'zh-TW')
  assert.equal(matchTag('zh-HK'), 'zh-TW')
  assert.equal(matchTag('zh-MO'), 'zh-TW')
  assert.equal(matchTag('zh-CN'), 'zh')
  assert.equal(matchTag('zh-SG'), 'zh')
})

test('bare zh is Simplified, matching what the built-in plugin persisted', () => {
  assert.equal(matchTag('zh'), 'zh')
})

test('casing is not significant', () => {
  assert.equal(matchTag('ZH-HANT-tw'), 'zh-TW')
  assert.equal(matchTag('JA-jp'), 'ja')
})

test('other languages match on their primary subtag', () => {
  assert.equal(matchTag('ja'), 'ja')
  assert.equal(matchTag('ja-JP'), 'ja')
  assert.equal(matchTag('ko-KR'), 'ko')
  assert.equal(matchTag('en-GB'), 'en')
})

test('an unshipped language matches nothing', () => {
  assert.equal(matchTag('fr-FR'), undefined)
  assert.equal(matchTag('de'), undefined)
  assert.equal(matchTag(''), undefined)
})
