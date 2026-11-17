/**
 * main.js — 서울국가유산 탐사대 메인 애플리케이션
 */

import { notebook } from './notebook.js';
import { filterHeritageItems, debounce } from './search.js';
import { HeritageModal } from './modal.js';

const PAGE_SIZE = 24;

// 종목 코드별 배지 CSS 클래스 매핑
function getBadgeClass(kindCode) {
  const code = String(kindCode || '');
  if (['11', '12', '13', '15', '16', '17', '18', '79'].includes(code)) {
    return `badge--${code}`;
  }
  return 'badge--seoul';
}

class App {
  constructor() {
    this.items = [];
    this.filteredItems = [];
    this.visibleCount = PAGE_SIZE;

    this.filters = {
      query: '',
      selectedKinds: new Set(['all']),
      gu: 'all',
      photoOnly: true,
      notebookOnly: false,
    };

    this.modal = new HeritageModal();

    this.dom = {
      searchInput: document.getElementById('searchInput'),
      searchClear: document.getElementById('searchClear'),
      kindFilter: document.getElementById('kindFilter'),
      guSelect: document.getElementById('guSelect'),
      photoOnly: document.getElementById('photoOnly'),
      notebookOnly: document.getElementById('notebookOnly'),
      resultCount: document.getElementById('resultCount'),
      cardGrid: document.getElementById('cardGrid'),
      noResults: document.getElementById('noResults'),
      loadMoreWrap: document.getElementById('loadMoreWrap'),
      loadMoreBtn: document.getElementById('loadMoreBtn'),
      todayCard: document.getElementById('todayCard'),
      notebookToggle: document.getElementById('notebookToggle'),
      notebookOverlay: document.getElementById('notebookOverlay'),
      notebookPanel: document.getElementById('notebookPanel'),
      notebookClose: document.getElementById('notebookClose'),
      notebookList: document.getElementById('notebookList'),
      notebookCount: document.getElementById('notebookCount'),
      updatedAt: document.getElementById('updatedAt'),
      sourceInfoBtn: document.getElementById('sourceInfoBtn'),
      sourceModalOverlay: document.getElementById('sourceModalOverlay'),
      sourceModalClose: document.getElementById('sourceModalClose'),
    };
  }

  async init() {
    this._bindEvents();
    await this._loadData();
    this._initGuOptions();
    this._renderTodayHeritage();
    this._applyFilters();
    this._checkInitialHash();
  }

  // ── 데이터 로드 ──

  async _loadData() {
    try {
      this.dom.resultCount.textContent = '⏳ 유산 도감을 펼치는 중…';
      const res = await fetch('/data/seoul-heritage.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      this.items = data.items || [];
      if (this.dom.updatedAt && data.updatedAt) {
        this.dom.updatedAt.textContent = data.updatedAt;
      }
    } catch (e) {
      console.error('데이터 로드 실패:', e);
      this.dom.resultCount.textContent = '❌ 유산 데이터를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.';
    }
  }

  // ── 자치구 옵션 구성 ──

  _initGuOptions() {
    const seoulGuSet = new Set();
    this.items.forEach((item) => {
      if (item.gu && item.gu.endsWith('구')) {
        seoulGuSet.add(item.gu);
      }
    });

    const sortedGus = Array.from(seoulGuSet).sort((a, b) => a.localeCompare(b, 'ko'));
    const fragment = document.createDocumentFragment();

    sortedGus.forEach((gu) => {
      const opt = document.createElement('option');
      opt.value = gu;
      opt.textContent = gu;
      fragment.appendChild(opt);
    });

    this.dom.guSelect.appendChild(fragment);
  }

  // ── 오늘의 유산 선정 ──

  _renderTodayHeritage() {
    const photoItems = this.items.filter((i) => i.image && i.summary);
    if (photoItems.length === 0) return;

    // 날짜 기반 시드 생성 (매일 1개 유산)
    const today = new Date();
    const dateNum = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
    const index = dateNum % photoItems.length;
    const item = photoItems[index];

    const badgeClass = getBadgeClass(item.kindCode);

    this.dom.todayCard.innerHTML = `
      <img
        class="today__card-img"
        src="${item.image}"
        alt="${item.name} 대표 사진"
        loading="lazy"
        onerror="this.onerror=null;this.src='/images/placeholder.svg';"
      />
      <div class="today__card-info">
        <span class="today__card-badge ${badgeClass}">${item.kind || '국가유산'}</span>
        <h3 class="today__card-name">${item.name}</h3>
        <p class="today__card-meta">📍 ${item.gu || '서울'} · 🕰 ${item.era || '시대 미상'}</p>
        <p class="today__card-desc">${item.summary || item.content || ''}</p>
      </div>
    `;

    this.dom.todayCard.addEventListener('click', () => {
      this.modal.open(item);
    });
  }

  // ── 필터 적용 ──

  _applyFilters() {
    this.filteredItems = filterHeritageItems(this.items, {
      query: this.filters.query,
      selectedKinds: this.filters.selectedKinds,
      gu: this.filters.gu,
      photoOnly: this.filters.photoOnly,
      notebookOnly: this.filters.notebookOnly,
      isBookmarked: (id) => notebook.has(id),
    });

    this.visibleCount = PAGE_SIZE;
    this._renderResults();
  }

  // ── 카드 렌더링 ──

  _renderResults() {
    const total = this.filteredItems.length;
    this.dom.resultCount.textContent = `🔍 ${total.toLocaleString('ko-KR')}개의 유산을 찾았어요!`;

    if (total === 0) {
      this.dom.cardGrid.innerHTML = '';
      this.dom.noResults.style.display = 'block';
      this.dom.loadMoreWrap.style.display = 'none';
      return;
    }

    this.dom.noResults.style.display = 'none';

    const visibleItems = this.filteredItems.slice(0, this.visibleCount);
    this.dom.cardGrid.innerHTML = visibleItems.map((item) => this._createCardHtml(item)).join('');

    // 카드 이벤트 바인딩
    const cards = this.dom.cardGrid.querySelectorAll('.card');
    cards.forEach((cardEl, idx) => {
      const item = visibleItems[idx];
      cardEl.addEventListener('click', () => this.modal.open(item));
      cardEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.modal.open(item);
        }
      });
    });

    // 더 보기 버튼 표시 여부
    if (this.visibleCount < total) {
      this.dom.loadMoreWrap.style.display = 'block';
    } else {
      this.dom.loadMoreWrap.style.display = 'none';
    }
  }

  _createCardHtml(item) {
    const badgeClass = getBadgeClass(item.kindCode);
    const imgUrl = item.image || '/images/placeholder.svg';

    return `
      <article class="card" tabindex="0" role="button" aria-label="${item.name} 상세 정보 보기">
        <div class="card__img-wrap">
          <span class="card__badge ${badgeClass}">${item.kind || '유산'}</span>
          <img
            class="card__img"
            src="${imgUrl}"
            alt="${item.name} 사진"
            loading="lazy"
            onerror="this.onerror=null;this.src='/images/placeholder.svg';"
          />
        </div>
        <div class="card__info">
          <h3 class="card__name" title="${item.name}">${item.name}</h3>
          <p class="card__meta">
            <span>📍 ${item.gu || '서울'}</span>
            <span>🕰 ${item.era || '미상'}</span>
          </p>
        </div>
      </article>
    `;
  }

  // ── 수첩 사이드 패널 렌더링 ──

  _renderNotebookPanel(savedItems) {
    this.dom.notebookCount.textContent = String(savedItems.length);

    if (savedItems.length === 0) {
      this.dom.notebookList.innerHTML = `
        <div class="notebook-empty">
          <p>아직 담은 유산이 없어요.</p>
          <p style="font-size:0.85rem;margin-top:6px;">마음에 드는 유산 카드를 눌러<br/>⭐ 수첩에 담아 보세요!</p>
        </div>
      `;
      return;
    }

    this.dom.notebookList.innerHTML = savedItems
      .map(
        (it) => `
        <div class="notebook-item" data-id="${it.id}">
          <img
            class="notebook-item__img"
            src="${it.image || '/images/placeholder.svg'}"
            alt="${it.name} 사진"
            onerror="this.onerror=null;this.src='/images/placeholder.svg';"
          />
          <span class="notebook-item__name">${it.name}</span>
          <button class="notebook-item__remove" data-remove-id="${it.id}" aria-label="${it.name} 삭제">✕</button>
        </div>
      `
      )
      .join('');

    // 수첩 항목 클릭 시 해당 모달 오픈
    this.dom.notebookList.querySelectorAll('.notebook-item').forEach((el) => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.notebook-item__remove')) return;
        const id = el.dataset.id;
        const target = this.items.find((i) => i.id === id);
        if (target) {
          this._closeNotebook();
          this.modal.open(target);
        }
      });
    });

    // 수첩 삭제 버튼 바인딩
    this.dom.notebookList.querySelectorAll('.notebook-item__remove').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.removeId;
        notebook.remove(id);
      });
    });
  }

  _openNotebook() {
    this.dom.notebookPanel.classList.add('is-open');
    this.dom.notebookOverlay.classList.add('is-open');
  }

  _closeNotebook() {
    this.dom.notebookPanel.classList.remove('is-open');
    this.dom.notebookOverlay.classList.remove('is-open');
  }

  // ── 해시 라우팅 ──

  _checkInitialHash() {
    const hash = window.location.hash;
    if (hash.startsWith('#heritage-')) {
      const id = hash.replace('#heritage-', '');
      const target = this.items.find((i) => i.id === id);
      if (target) {
        this.modal.open(target);
      }
    }
  }

  // ── 이벤트 바인딩 ──

  _bindEvents() {
    // 1. 검색어 입력 (300ms 디바운스)
    const onSearch = debounce((query) => {
      this.filters.query = query;
      this._applyFilters();
    }, 300);

    this.dom.searchInput.addEventListener('input', (e) => {
      const val = e.target.value;
      this.dom.searchClear.style.display = val ? 'flex' : 'none';
      onSearch(val);
    });

    this.dom.searchClear.addEventListener('click', () => {
      this.dom.searchInput.value = '';
      this.dom.searchClear.style.display = 'none';
      this.filters.query = '';
      this._applyFilters();
      this.dom.searchInput.focus();
    });

    // 2. 종목 필터 칩 클릭
    this.dom.kindFilter.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;

      const kind = chip.dataset.kind;

      if (kind === 'all') {
        // 전체 클릭 시 전체만 활성화
        this.filters.selectedKinds = new Set(['all']);
        this.dom.kindFilter.querySelectorAll('.chip').forEach((c) => {
          c.classList.toggle('chip--active', c.dataset.kind === 'all');
        });
      } else {
        // 개별 종목 클릭 시 전체 끄고 다중 토글
        this.filters.selectedKinds.delete('all');
        const allChip = this.dom.kindFilter.querySelector('[data-kind="all"]');
        if (allChip) allChip.classList.remove('chip--active');

        if (this.filters.selectedKinds.has(kind)) {
          this.filters.selectedKinds.delete(kind);
          chip.classList.remove('chip--active');
        } else {
          this.filters.selectedKinds.add(kind);
          chip.classList.add('chip--active');
        }

        // 아무것도 선택 안 되었으면 다시 '전체' 활성화
        if (this.filters.selectedKinds.size === 0) {
          this.filters.selectedKinds.add('all');
          if (allChip) allChip.classList.add('chip--active');
        }
      }

      this._applyFilters();
    });

    // 3. 자치구 변경
    this.dom.guSelect.addEventListener('change', (e) => {
      this.filters.gu = e.target.value;
      this._applyFilters();
    });

    // 4. 사진 있는 것만 보기 체크박스
    this.dom.photoOnly.addEventListener('change', (e) => {
      this.filters.photoOnly = e.target.checked;
      this._applyFilters();
    });

    // 5. 내 수첩에 담은 것만 보기 체크박스
    this.dom.notebookOnly.addEventListener('change', (e) => {
      this.filters.notebookOnly = e.target.checked;
      this._applyFilters();
    });

    // 6. 더 보기 버튼
    this.dom.loadMoreBtn.addEventListener('click', () => {
      this.visibleCount += PAGE_SIZE;
      this._renderResults();
    });

    // 7. 추천 검색어 버튼 클릭
    this.dom.noResults.addEventListener('click', (e) => {
      const btn = e.target.closest('.no-results__btn');
      if (!btn) return;
      const q = btn.dataset.query;
      this.dom.searchInput.value = q;
      this.dom.searchClear.style.display = 'flex';
      this.filters.query = q;
      this._applyFilters();
    });

    // 8. 수첩 패널 토글 & 닫기
    this.dom.notebookToggle.addEventListener('click', () => this._openNotebook());
    this.dom.notebookClose.addEventListener('click', () => this._closeNotebook());
    this.dom.notebookOverlay.addEventListener('click', () => this._closeNotebook());

    // 9. 수첩 저장소 변경 구독
    notebook.subscribe((savedItems) => {
      this._renderNotebookPanel(savedItems);
      // '내 수첩에 담은 것만 보기'가 켜져 있으면 실시간 반영
      if (this.filters.notebookOnly) {
        this._applyFilters();
      }
    });

    // 10. 출처 안내 모달 토글
    this.dom.sourceInfoBtn?.addEventListener('click', () => {
      this.dom.sourceModalOverlay.classList.add('is-open');
    });
    this.dom.sourceModalClose?.addEventListener('click', () => {
      this.dom.sourceModalOverlay.classList.remove('is-open');
    });
    this.dom.sourceModalOverlay?.addEventListener('click', (e) => {
      if (e.target === this.dom.sourceModalOverlay) {
        this.dom.sourceModalOverlay.classList.remove('is-open');
      }
    });

    // 11. hashchange 감지
    window.addEventListener('hashchange', () => {
      const hash = window.location.hash;
      if (hash.startsWith('#heritage-')) {
        const id = hash.replace('#heritage-', '');
        const target = this.items.find((i) => i.id === id);
        if (target && !this.modal.isOpen()) {
          this.modal.open(target);
        }
      } else if (!hash || hash === '#explore') {
        if (this.modal.isOpen()) {
          this.modal.close();
        }
      }
    });
  }
}

// 앱 실행
document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});
