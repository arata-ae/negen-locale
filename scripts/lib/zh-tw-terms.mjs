/**
 * Taiwan vocabulary that character conversion cannot reach.
 *
 * `convertZhTw` rewrites characters and nothing else, so a converted zh string
 * can be perfectly Traditional and still read as mainland Chinese: 文件 for a
 * file, 插件 for a plugin, 搜索 for a search. Those keys need a curated zh-TW
 * value. This table is what tells the dictionary gate which ones they are, so
 * a key upstream adds tomorrow is reported rather than shipping mainland
 * wording to a Taiwan reader forever.
 *
 * Longest term first: 文件夾 must be consumed before 文件.
 */
export const TERMS = [
  ['文件夾', '資料夾'], ['服務器', '伺服器'], ['對話框', '對話方塊'], ['標識符', '識別碼'],
  ['命令行', '命令列'], ['剪貼板', '剪貼簿'], ['自定義', '自訂'], ['提供方', '提供者'],
  ['文件', '檔案'], ['消息', '訊息'], ['信息', '訊息'], ['支持', '支援'], ['搜索', '搜尋'],
  ['默認', '預設'], ['缺省', '預設'], ['設置', '設定'], ['配置', '設定'], ['插件', '外掛'],
  ['緩存', '快取'], ['窗口', '視窗'], ['字符', '字元'], ['字節', '位元組'], ['網絡', '網路'],
  ['程序', '程式'], ['數據', '資料'], ['內存', '記憶體'], ['視頻', '影片'], ['界面', '介面'],
  ['質量', '品質'], ['用戶', '使用者'], ['刷新', '重新整理'], ['菜單', '選單'], ['進程', '行程'],
  ['線程', '執行緒'], ['隊列', '佇列'], ['打印', '列印'], ['粘貼', '貼上'], ['撤銷', '復原'],
  ['創建', '建立'], ['激活', '啟用'], ['卸載', '解除安裝'], ['腳本', '指令碼'],
  ['終端', '終端機'], ['調試', '偵錯'], ['只讀', '唯讀'], ['智能', '智慧'], ['加載', '載入'],
  ['保存', '儲存'], ['軟件', '軟體'], ['硬件', '硬體'], ['登錄', '登入'],
  ['打開', '開啟'], ['添加', '新增'], ['新建', '新增'], ['發送', '傳送'],
  ['調用', '呼叫'], ['運行', '執行'], ['文本', '文字'], ['反饋', '回饋'],
  ['占用', '佔用'], ['查看', '檢視'], ['當前', '目前'], ['視圖', '檢視'],
  ['分辨率', '解析度'], ['工具欄', '工具列'], ['退出碼', '結束代碼'], ['內置', '內建'],
  ['後台', '背景'], ['計劃', '計畫'], ['滾動', '捲動'], ['構建', '建置'], ['超時', '逾時'],
  ['接口', '介面'], ['歸檔', '封存'], ['替換', '取代'], ['匹配', '相符'],
  ['全屏', '全螢幕'], ['標簽頁', '分頁'], ['代碼', '程式碼'],
  ['審批', '審核'], ['腳註', '註腳'], ['沒法', '無法'],
]

/** Every Taiwan form, longest first, for the blanking pass in {@link needsCuration}. */
const TAIWAN_FORMS = [...new Set(TERMS.map(([, taiwan]) => taiwan))].sort((a, b) => b.length - a.length)

/**
 * Characters the conversion table deliberately leaves alone: each has more
 * than one Traditional form and only the surrounding word decides which.
 */
export const AMBIGUOUS = /[复并余里]/

/**
 * Whether a converted zh string still needs a hand-written zh-TW value.
 * @param converted - a zh string after character conversion.
 * @returns true when mainland vocabulary or an ambiguous character remains.
 */
export function needsCuration(converted) {
  if (AMBIGUOUS.test(converted)) return true
  // A Taiwan form can contain its own mainland form — 終端機 contains 終端,
  // 預設值 contains 預設 — so blank out what is already right before looking
  // for what is not. Longest first, or a short form eats a longer one's text.
  let rest = converted
  for (const taiwan of TAIWAN_FORMS) rest = rest.split(taiwan).join('\u0000')
  return TERMS.some(([mainland, taiwan]) => mainland !== taiwan && rest.includes(mainland))
}
