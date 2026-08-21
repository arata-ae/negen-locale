import type { CommonKey } from './zh.ts'

/** ko dictionary for the common namespace, checked complete against the zh key set. */
export const ko = {
  'ok': '확인',
  'cancel': '취소',
  'close': '닫기',
  'copy': '복사',
  'copied': '복사됨',
  'retry': '다시 시도',
  'loading': '불러오는 중…',
  'load.failed': '불러오지 못했습니다',
  'submit': '제출',
  'submitting': '제출 중…',
  'next': '다음',
  'previous': '이전',
  'skip': '건너뛰기',
  'delete': '삭제',
  'edit': '편집',
  'save': '저장',
  'search': '검색',
  'more': '더 보기',
  'collapse': '접기',
  'expand': '펼치기',
  'back': '뒤로',
  'unknown': '알 수 없음',
  'none': '없음',
  'truncated': '잘림',
} satisfies Record<CommonKey, string>
