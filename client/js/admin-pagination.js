/**
 * EOnlineBazar Admin — Unified Pagination System
 * Use this on every admin page that has a data table.
 */

class AdminPagination {
  constructor(options) {
    this.containerId = options.containerId; // ID of pagination container div
    this.infoId = options.infoId;           // ID of "Showing X-Y of Z" span
    this.countId = options.countId;         // ID of total count badge
    this.limitSelectId = options.limitSelectId; // ID of entries-per-page select
    this.jumpInputId = options.jumpInputId
      || (options.containerId ? options.containerId.replace('-pg-btns', '-pg-jump') : null);
    this.onPageChange = options.onPageChange;   // callback(page, limit)

    this.currentPage = 1;
    this.currentLimit = options.defaultLimit || 10;
    this.totalItems = 0;
    this.totalPages = 1;

    this._bindStaticControls();
  }

  /** Event delegation on stable wrappers — survives innerHTML re-renders of page buttons */
  _bindStaticControls() {
    const container = document.getElementById(this.containerId);
    if (container && !container.dataset.pgBound) {
      container.dataset.pgBound = '1';
      container.addEventListener('click', (e) => {
        const btn = e.target.closest('button.apg-btn[data-page]');
        if (!btn || btn.disabled) return;
        e.preventDefault();
        const page = parseInt(btn.dataset.page, 10);
        if (!Number.isNaN(page)) this.goTo(page);
      });
    }

    const limitSelect = document.getElementById(this.limitSelectId);
    if (limitSelect && !limitSelect.dataset.pgBound) {
      limitSelect.dataset.pgBound = '1';
      limitSelect.removeAttribute('onchange');
      limitSelect.addEventListener('change', () => this.changeLimit(limitSelect.value));
    }

    if (!this.jumpInputId) return;
    const jumpInput = document.getElementById(this.jumpInputId);
    if (!jumpInput || jumpInput.dataset.pgBound) return;
    jumpInput.dataset.pgBound = '1';
    jumpInput.removeAttribute('onkeydown');

    jumpInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this._jumpToInput();
      }
    });

    const goBtn = jumpInput.parentElement?.querySelector('button.apg-jump-btn, button[type="button"]');
    if (goBtn && !goBtn.dataset.pgBound) {
      goBtn.dataset.pgBound = '1';
      goBtn.removeAttribute('onclick');
      goBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this._jumpToInput();
      });
    }
  }

  _jumpToInput() {
    const jumpInput = document.getElementById(this.jumpInputId);
    if (!jumpInput) return;
    const val = parseInt(jumpInput.value, 10);
    if (!Number.isNaN(val)) this.goTo(val);
  }

  setTotal(total) {
    this.totalItems = total;
    this.totalPages = Math.max(1, Math.ceil(total / this.currentLimit));
    if (this.currentPage > this.totalPages) this.currentPage = this.totalPages;
    this.render();
  }

  getPageNumbers() {
    const { currentPage: c, totalPages: t } = this;
    if (t <= 7) return Array.from({ length: t }, (_, i) => i + 1);
    if (c <= 4) return [1, 2, 3, 4, 5, '...', t];
    if (c >= t - 3) return [1, '...', t - 4, t - 3, t - 2, t - 1, t];
    return [1, '...', c - 1, c, c + 1, '...', t];
  }

  render() {
    const start = this.totalItems === 0 ? 0 : (this.currentPage - 1) * this.currentLimit + 1;
    const end = Math.min(this.currentPage * this.currentLimit, this.totalItems);

    const infoEl = document.getElementById(this.infoId);
    if (infoEl) {
      infoEl.textContent = this.totalItems === 0
        ? 'No entries found'
        : `Showing ${start}–${end} of ${this.totalItems} entries`;
    }

    const countEl = document.getElementById(this.countId);
    if (countEl) countEl.textContent = this.totalItems;

    const container = document.getElementById(this.containerId);
    if (!container) return;

    let html = '';

    html += `<button type="button" class="apg-btn"
      ${this.currentPage <= 1 ? 'disabled' : ''}
      data-page="${this.currentPage - 1}"
      aria-label="Previous page">
      ← Prev
    </button>`;

    this.getPageNumbers().forEach(p => {
      if (p === '...') {
        html += `<span class="apg-dots">⋯</span>`;
      } else {
        html += `<button type="button" class="apg-btn ${p === this.currentPage ? 'apg-active' : ''}"
          data-page="${p}"
          ${p === this.currentPage ? 'aria-current="page"' : ''}
          aria-label="Page ${p}">${p}</button>`;
      }
    });

    html += `<button type="button" class="apg-btn"
      ${this.currentPage >= this.totalPages ? 'disabled' : ''}
      data-page="${this.currentPage + 1}"
      aria-label="Next page">
      Next →
    </button>`;

    container.innerHTML = html;

    const limitSelect = document.getElementById(this.limitSelectId);
    if (limitSelect && String(limitSelect.value) !== String(this.currentLimit)) {
      limitSelect.value = String(this.currentLimit);
    }

    const jumpInput = document.getElementById(this.jumpInputId);
    if (jumpInput) {
      jumpInput.max = String(this.totalPages);
      jumpInput.min = '1';
    }
  }

  goTo(page) {
    const p = parseInt(page, 10);
    if (Number.isNaN(p) || p < 1 || p > this.totalPages) return;
    this.currentPage = p;
    this.render();
    if (this.onPageChange) this.onPageChange(this.currentPage, this.currentLimit);
  }

  changeLimit(val) {
    this.currentLimit = parseInt(val, 10) || this.currentLimit;
    this.currentPage = 1;
    this.render();
    if (this.onPageChange) this.onPageChange(this.currentPage, this.currentLimit);
  }

  resetPage() {
    this.currentPage = 1;
  }

  stayOnPage() {
    if (this.onPageChange) this.onPageChange(this.currentPage, this.currentLimit);
  }
}

window.AdminPagination = AdminPagination;







