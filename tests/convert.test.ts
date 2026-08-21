import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { CHAR_TABLE_SIZE, convertZhTw } from '../src/client/convert.ts'

test('the shipped table is not empty', () => {
  assert.ok(CHAR_TABLE_SIZE > 500, `expected a real table, got ${CHAR_TABLE_SIZE} entries`)
})

test('Simplified characters become Traditional', () => {
  assert.equal(convertZhTw('关闭'), '關閉')
  assert.equal(convertZhTw('设置'), '設置')
  assert.equal(convertZhTw('无选项'), '無選項')
})

test('text with nothing to convert comes back identical', () => {
  const untouched = 'Loading…'
  assert.equal(convertZhTw(untouched), untouched)
  assert.equal(convertZhTw('確定'), '確定')
})

test('placeholders survive conversion', () => {
  // {name} holds no Han characters, so the table cannot reach inside it.
  assert.equal(convertZhTw('打开 {name}'), '打開 {name}')
  assert.equal(convertZhTw('+ {count} 个文件'), '+ {count} 個文件')
})

test('conversion is character-level and cannot fix vocabulary', () => {
  // This is the limitation that makes curated dictionaries the first rung:
  // Taiwan says 搜尋, and no character table turns 搜索 into it.
  assert.notEqual(convertZhTw('搜索'), '搜尋')
})
