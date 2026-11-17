/**
 * modal.js — 유산 상세 정보 모달
 */

import { notebook } from './notebook.js';

export class HeritageModal {
  constructor() {
    this.overlay = document.getElementById('modalOverlay');
    this.modal = document.getElementById('modal');
    this.closeBtn = document.getElementById('modalClose');
    this.body = document.getElementById('modalBody');

    this.currentItem = null;
    this.currentImageIndex = 0;
    this.isExpanded = false;

    this._bindEvents();
  }

  _bindEvents() {
    this.closeBtn.addEventListener('click', () => this.close());
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) {
        this.close();
      }
    });
  }

  isOpen() {
    return this.overlay.classList.contains('is-open');
  }

  open(item) {
    if (!item) return;
    this.currentItem = item;
    this.currentImageIndex = 0;
    this.isExpanded = false;

    this.render();
    this.overlay.classList.add('is-open');
    this.overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');

    // URL 해시 업데이트
    if (window.location.hash !== `#heritage-${item.id}`) {
      history.replaceState(null, '', `#heritage-${item.id}`);
    }

    // 모달 상단으로 스크롤 리셋
    this.modal.scrollTop = 0;
  }

  close() {
    if (!this.isOpen()) return;
    this.overlay.classList.remove('is-open');
    this.overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    this.currentItem = null;

    // URL 해시 원복 (모달 닫힘 시 explore로)
    if (window.location.hash.startsWith('#heritage-')) {
      history.replaceState(null, '', '#explore');
    }
  }

  nextImage() {
    const images = this.getImages();
    if (images.length <= 1) return;
    this.currentImageIndex = (this.currentImageIndex + 1) % images.length;
    this.updateGallery();
  }

  prevImage() {
    const images = this.getImages();
    if (images.length <= 1) return;
    this.currentImageIndex = (this.currentImageIndex - 1 + images.length) % images.length;
    this.updateGallery();
  }

  getImages() {
    if (!this.currentItem) return [];
    if (this.currentItem.images && this.currentItem.images.length > 0) {
      return this.currentItem.images;
    }
    if (this.currentItem.image) {
      return [{ url: this.currentItem.image, caption: '' }];
    }
    return [{ url: '/images/placeholder.svg', caption: '사진 준비 중' }];
  }

  updateGallery() {
    const images = this.getImages();
    const cur = images[this.currentImageIndex] || images[0];

    const imgEl = this.body.querySelector('.modal__main-img');
    const capEl = this.body.querySelector('.modal__caption');

    if (imgEl) {
      imgEl.src = cur.url;
      imgEl.alt = `${this.currentItem.name} 사진 ${this.currentImageIndex + 1}`;
    }
    if (capEl) {
      const pageInfo = images.length > 1 ? `(${this.currentImageIndex + 1}/${images.length}) ` : '';
      capEl.textContent = `${pageInfo}${cur.caption || ''}`.trim();
    }
  }

  render() {
    const item = this.currentItem;
    const images = this.getImages();
    const curImg = images[0];
    const hasMultipleImages = images.length > 1;

    const isBookmarked = notebook.has(item.id);

    // 지도 검색 링크 (좌표 또는 주소)
    const mapQuery = item.address || item.name;
    const mapUrl = `https://map.kakao.com/link/search/${encodeURIComponent(mapQuery)}`;

    // 설명문 정리: 요약본 vs 전체
    const summaryText = item.summary || item.content || '등록된 설명이 없습니다.';
    const fullText = item.content || summaryText;
    const hasMore = fullText.length > summaryText.length && fullText !== summaryText;

    this.body.innerHTML = `
      <div class="modal__gallery">
        <img
          class="modal__main-img"
          src="${curImg.url}"
          alt="${item.name} 사진"
          onerror="this.onerror=null;this.src='/images/placeholder.svg';"
        />
        ${
          hasMultipleImages
            ? `
          <button class="modal__gallery-nav modal__gallery-nav--prev" id="modalPrevImg" aria-label="이전 사진">‹</button>
          <button class="modal__gallery-nav modal__gallery-nav--next" id="modalNextImg" aria-label="다음 사진">›</button>
        `
            : ''
        }
        <div class="modal__caption">
          ${hasMultipleImages ? `(1/${images.length}) ` : ''}${curImg.caption || ''}
        </div>
        <div class="modal__photo-credit">사진 출처: 국가유산청</div>
      </div>

      <div class="modal__content">
        <h2 class="modal__name">${item.name}</h2>
        ${item.hanja ? `<p class="modal__hanja">${item.hanja}</p>` : ''}

        <table class="modal__info-table">
          <tbody>
            <tr>
              <th>종목</th>
              <td>${item.kind || '-'}</td>
            </tr>
            <tr>
              <th>시대</th>
              <td>${item.era || '미상'}</td>
            </tr>
            <tr>
              <th>소재지</th>
              <td>${item.address || (item.gu ? `서울 ${item.gu}` : '-')}</td>
            </tr>
            <tr>
              <th>지정일</th>
              <td>${item.designatedAt || '-'}</td>
            </tr>
            <tr>
              <th>관리자</th>
              <td>${item.admin || '-'}</td>
            </tr>
          </tbody>
        </table>

        <div class="modal__description">
          <p id="modalDescText">${summaryText}</p>
          ${
            hasMore
              ? `<button class="modal__desc-toggle" id="modalDescToggle">설명 더 보기 ▼</button>`
              : ''
          }
        </div>

        <div class="modal__actions">
          <button class="modal__action-btn modal__action-btn--notebook ${
            isBookmarked ? 'is-saved' : ''
          }" id="modalNotebookBtn">
            <span>⭐</span> ${isBookmarked ? '수첩에서 빼기' : '수첩에 담기'}
          </button>
          <a class="modal__action-btn modal__action-btn--map" href="${mapUrl}" target="_blank" rel="noopener noreferrer">
            <span>📍</span> 지도에서 보기 ↗
          </a>
          <a class="modal__action-btn modal__action-btn--source" href="${
            item.sourceUrl
          }" target="_blank" rel="noopener noreferrer">
            <span>🔗</span> 출처: 국가유산청에서 더 알아보기 ↗
          </a>
        </div>
      </div>
    `;

    // 갤러리 이전/다음 버튼 바인딩
    if (hasMultipleImages) {
      this.body.querySelector('#modalPrevImg')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.prevImage();
      });
      this.body.querySelector('#modalNextImg')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.nextImage();
      });
    }

    // 설명 더보기/접기 토글 바인딩
    const toggleBtn = this.body.querySelector('#modalDescToggle');
    const descText = this.body.querySelector('#modalDescText');
    if (toggleBtn && descText) {
      toggleBtn.addEventListener('click', () => {
        this.isExpanded = !this.isExpanded;
        if (this.isExpanded) {
          descText.textContent = fullText;
          toggleBtn.textContent = '설명 접기 ▲';
        } else {
          descText.textContent = summaryText;
          toggleBtn.textContent = '설명 더 보기 ▼';
        }
      });
    }

    // 수첩 담기/빼기 버튼 바인딩
    const nbBtn = this.body.querySelector('#modalNotebookBtn');
    if (nbBtn) {
      nbBtn.addEventListener('click', () => {
        const added = notebook.toggle(item);
        if (added) {
          nbBtn.classList.add('is-saved');
          nbBtn.innerHTML = '<span>⭐</span> 수첩에서 빼기';
        } else {
          nbBtn.classList.remove('is-saved');
          nbBtn.innerHTML = '<span>⭐</span> 수첩에 담기';
        }
      });
    }
  }
}
