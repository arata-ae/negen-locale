import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { AMBIGUOUS, TERMS, needsCuration } from '../scripts/lib/zh-tw-terms.mjs'

test('mainland vocabulary is caught', () => {
  // Each is Traditional already — character conversion cannot see the problem.
  assert.equal(needsCuration('沒有匹配的外掛'), true)
  assert.equal(needsCuration('{count} 個後台任務'), true)
  assert.equal(needsCuration('計劃待審'), true)
  assert.equal(needsCuration('內置'), true)
})

test('Taiwan vocabulary passes', () => {
  assert.equal(needsCuration('沒有相符的外掛'), false)
  assert.equal(needsCuration('{count} 個背景任務'), false)
  assert.equal(needsCuration('計畫待審'), false)
  assert.equal(needsCuration('內建'), false)
})

test('a Taiwan form containing its own mainland form does not self-flag', () => {
  // 終端機 contains 終端, 預設值 contains 預設, 命令列 contains 命令行's shape.
  assert.equal(needsCuration('終端機'), false)
  assert.equal(needsCuration('供應商預設值'), false)
  assert.equal(needsCuration('在命令列中執行'), false)
})

test('the blanking pass does not hide a real hit next to a correct one', () => {
  // 終端機 is right and 匹配 is wrong; blanking the first must not swallow the second.
  assert.equal(needsCuration('終端機無匹配結果'), true)
})

test('ambiguous characters always need a hand-written value', () => {
  // 复 has several Traditional forms (複/復/覆) and only context picks one, so
  // the character table refuses to guess and leaves it Simplified.
  for (const ch of ['复', '并', '余', '里']) {
    assert.equal(AMBIGUOUS.test(ch), true, ch)
    assert.equal(needsCuration(`測試${ch}測試`), true, ch)
  }
})

test('every pair is a real substitution, and no duplicates', () => {
  const seen = new Set<string>()
  for (const [mainland, taiwan] of TERMS) {
    assert.notEqual(mainland, taiwan, `${mainland} maps to itself`)
    assert.equal(seen.has(mainland), false, `${mainland} appears twice`)
    seen.add(mainland)
  }
})

test('a mainland form never precedes one that contains it', () => {
  // 文件 before 文件夾 would consume the text 文件夾 needs, so the longer term
  // would never fire and 資料夾 would be reported as already correct.
  const order = TERMS.map(([mainland]) => mainland)
  for (const [at, shorter] of order.entries()) {
    const swallowed = order.findIndex((longer, i) => i > at && longer.includes(shorter))
    assert.equal(swallowed, -1, `${shorter} at ${at} precedes ${order[swallowed]} at ${swallowed}`)
  }
})
