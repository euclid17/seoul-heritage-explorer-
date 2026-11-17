/**
 * search.js — 검색 및 필터링 엔진
 */

// 서울시 지정 및 문화유산자료 코드 묶음
const SEOUL_DESIGNATED_CODES = new Set(['21', '22', '23', '24', '25', '31']);

/**
 * 텍스트 정규화: 띄어쓰기 및 소문자 변환
 */
export function normalize(str) {
  if (!str) return '';
  return String(str).toLowerCase().replace(/\s+/g, '');
}

/**
 * 아이템이 선택된 종목 필터에 부합하는지 판별
 */
function matchKind(item, selectedKinds) {
  if (!selectedKinds || selectedKinds.size === 0 || selectedKinds.has('all')) {
    return true;
  }

  const kindCode = String(item.kindCode || '');
  for (const k of selectedKinds) {
    if (k === 'seoul') {
      if (SEOUL_DESIGNATED_CODES.has(kindCode) || (item.kind && item.kind.includes('시도'))) {
        return true;
      }
    } else if (kindCode === k) {
      return true;
    }
  }
  return false;
}

/**
 * 유산 목록 필터링 실행
 * @param {Array} items
 * @param {Object} options
 * @param {string} options.query - 검색어
 * @param {Set<string>} options.selectedKinds - 선택된 종목 코드 Set
 * @param {string} options.gu - 선택된 자치구 ('all' 또는 구 이름)
 * @param {boolean} options.photoOnly - 사진 있는 것만 보기
 * @param {boolean} options.notebookOnly - 수첩에 담은 것만 보기
 * @param {Function} options.isBookmarked - (id) => boolean
 */
export function filterHeritageItems(items, options) {
  const {
    query = '',
    selectedKinds = new Set(['all']),
    gu = 'all',
    photoOnly = true,
    notebookOnly = false,
    isBookmarked = () => false,
  } = options;

  const normQuery = normalize(query);

  return items.filter((item) => {
    // 1. 수첩 필터
    if (notebookOnly && !isBookmarked(item.id)) {
      return false;
    }

    // 2. 사진 필터
    if (photoOnly && !item.image) {
      return false;
    }

    // 3. 자치구 필터
    if (gu && gu !== 'all' && item.gu !== gu) {
      return false;
    }

    // 4. 종목 필터
    if (!matchKind(item, selectedKinds)) {
      return false;
    }

    // 5. 검색어 (띄어쓰기 무시)
    if (normQuery) {
      const searchTargets = [
        item.name,
        item.hanja,
        item.gu,
        item.era,
        item.kind,
        item.address,
        item.content,
      ];
      const matched = searchTargets.some((field) => {
        if (!field) return false;
        return normalize(field).includes(normQuery);
      });
      if (!matched) return false;
    }

    return true;
  });
}

/**
 * 검색 디바운스 헬퍼
 */
export function debounce(fn, waitMs = 300) {
  let timeoutId = null;
  return function (...args) {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      fn.apply(this, args);
    }, waitMs);
  };
}
