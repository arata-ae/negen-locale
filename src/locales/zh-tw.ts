import type { CommonKey } from './zh.ts'

/**
 * zh-TW dictionary for the common namespace. Curated rather than converted:
 * 載入 / 儲存 / 搜尋 / 略過 are vocabulary differences from the Simplified
 * source, which no character table can produce. The table is the fallback for
 * keys nobody has curated yet, not the plan for the ones that matter.
 */
export const zhTW = {
  'ok': '確定',
  'cancel': '取消',
  'close': '關閉',
  'copy': '複製',
  'copied': '複製成功',
  'retry': '重試',
  'loading': '載入中…',
  'load.failed': '載入失敗',
  'submit': '提交',
  'submitting': '正在提交…',
  'next': '下一步',
  'previous': '上一步',
  'skip': '略過',
  'delete': '刪除',
  'edit': '編輯',
  'save': '儲存',
  'search': '搜尋',
  'more': '更多',
  'collapse': '收合',
  'expand': '展開',
  'back': '返回',
  'unknown': '未知',
  'none': '無',
  'truncated': '已截斷',
} satisfies Record<CommonKey, string>
