const BANNER_DESKTOP_MAX = 300;
const BANNER_DESKTOP_MIN = 80;
const BANNER_MOBILE_MAX = 200;
const BANNER_MOBILE_MIN = 60;
const BANNER_DEFAULT_HEIGHT = '300px';
const BANNER_DEFAULT_MOBILE_HEIGHT = '200px';

function normalizeBannerHeight(value, min, max, fallback) {
  const v = String(value || '').trim();
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  const clamped = Math.min(max, Math.max(min, n));
  return `${clamped}px`;
}

function heightToUnitless(pxValue, fallback) {
  const n = parseInt(String(pxValue || '').trim(), 10);
  return Number.isFinite(n) ? n : fallback;
}

class BannerSlider {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.banners = [];
    this.settings = {};
    this.currentIndex = 0;
    this.autoPlayTimer = null;
    this.isAnimating = false;

    if (!this.container) return;
    this.init();
  }

  async init() {
    try {
      const res = await fetch('/api/store/banners');
      const data = await res.json();

      if (!data.success || !data.banners?.length) {
        this.showFallback();
        return;
      }

      this.banners = data.banners;
      this.settings = data.settings || {};
      this.render();
      this.setupControls();
      if (this.settings.autoPlay && this.banners.length > 1) {
        this.startAutoPlay();
      }
    } catch (err) {
      this.showFallback();
    }
  }

  showFallback() {
    if (!this.container) return;
    this.container.innerHTML = `
      <div class="banner-fallback">
        <h2>Best Quality Products</h2>
        <p>Fast delivery, easy returns</p>
      </div>
    `;
  }

  escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  renderSlideBackground(b, index) {
    const bgColor = b.backgroundColor || '#1a1a2e';
    const hasImage = Boolean(b.imageUrl);

    if (!hasImage) {
      return `
        <div class="banner-bg banner-bg--solid"
             style="background-color:${this.escapeHtml(bgColor)}"
             role="img"
             aria-label="${this.escapeHtml(b.title || 'Banner')}"></div>
      `;
    }

    return `
      <picture>
        ${b.mobileImageUrl ? `
          <source media="(max-width: 768px)"
                  srcset="${this.escapeHtml(b.mobileImageUrl)}">
        ` : ''}
        <img class="banner-bg"
             src="${this.escapeHtml(b.imageUrl)}"
             alt="${this.escapeHtml(b.title || 'Banner')}"
             loading="${index === 0 ? 'eager' : 'lazy'}">
      </picture>
    `;
  }

  render() {
    const h = normalizeBannerHeight(
      this.settings.height,
      BANNER_DESKTOP_MIN,
      BANNER_DESKTOP_MAX,
      BANNER_DEFAULT_HEIGHT
    );
    const mh = normalizeBannerHeight(
      this.settings.mobileHeight,
      BANNER_MOBILE_MIN,
      BANNER_MOBILE_MAX,
      BANNER_DEFAULT_MOBILE_HEIGHT
    );
    const hNum = heightToUnitless(h, 300);
    const mhNum = heightToUnitless(mh, 200);

    this.container.style.setProperty('--banner-height', h);
    this.container.style.setProperty('--banner-mobile-height', mh);
    this.container.style.setProperty('--banner-h', String(hNum));
    this.container.style.setProperty('--banner-mh', String(mhNum));

    this.container.innerHTML = `
      <div id="bannerSliderWrap"
           style="--banner-height:${h};--banner-mobile-height:${mh};--banner-h:${hNum};--banner-mh:${mhNum}">
        ${this.banners.map((b, i) => `
          <div class="banner-slide ${i === 0 ? 'active' : ''}
               ${this.settings.transitionEffect === 'fade' ? 'fade-mode' : ''}"
               data-index="${i}">
            ${this.renderSlideBackground(b, i)}
            <div class="banner-overlay"
                 style="--opacity:${b.overlayOpacity ?? 0.3}"></div>
            ${(b.title || b.subtitle || b.linkUrl) ? `
              <div class="banner-content">
                ${b.title ? `
                  <h2 class="banner-title"
                      style="color:${this.escapeHtml(b.textColor || '#fff')}">
                    ${this.escapeHtml(b.title)}
                  </h2>
                ` : ''}
                ${b.subtitle ? `
                  <p class="banner-subtitle"
                     style="color:${this.escapeHtml(b.textColor || '#fff')}">
                    ${this.escapeHtml(b.subtitle)}
                  </p>
                ` : ''}
                ${b.linkUrl ? `
                  <a href="${this.escapeHtml(b.linkUrl)}" class="banner-cta">
                    ${this.escapeHtml(b.linkText || 'Shop Now')}
                  </a>
                ` : ''}
              </div>
            ` : ''}
          </div>
        `).join('')}

        ${this.settings.showArrows !== false && this.banners.length > 1 ? `
          <button type="button" class="banner-arrow banner-arrow-prev"
                  aria-label="Previous banner"
                  onclick="window._bannerSlider.prev()">‹</button>
          <button type="button" class="banner-arrow banner-arrow-next"
                  aria-label="Next banner"
                  onclick="window._bannerSlider.next()">›</button>
        ` : ''}

        ${this.settings.showDots !== false && this.banners.length > 1 ? `
          <div class="banner-dots">
            ${this.banners.map((_, i) => `
              <button type="button" class="banner-dot ${i === 0 ? 'active' : ''}"
                      aria-label="Go to banner ${i + 1}"
                      onclick="window._bannerSlider.goTo(${i})"></button>
            `).join('')}
          </div>
        ` : ''}

        <div class="banner-progress" id="bannerProgress"></div>
      </div>
    `;

    window._bannerSlider = this;
  }

  setupControls() {
    let startX = 0;
    const wrap = document.getElementById('bannerSliderWrap');
    if (!wrap) return;

    wrap.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
    }, { passive: true });

    wrap.addEventListener('touchend', (e) => {
      const diff = startX - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 50) {
        diff > 0 ? this.next() : this.prev();
      }
    }, { passive: true });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') this.prev();
      if (e.key === 'ArrowRight') this.next();
    });

    wrap.addEventListener('mouseenter', () => this.stopAutoPlay());
    wrap.addEventListener('mouseleave', () => {
      if (this.settings.autoPlay && this.banners.length > 1) {
        this.startAutoPlay();
      }
    });
  }

  goTo(index) {
    if (this.isAnimating || index === this.currentIndex) return;
    this.isAnimating = true;

    const slides = document.querySelectorAll('.banner-slide');
    const dots = document.querySelectorAll('.banner-dot');

    slides[this.currentIndex]?.classList.remove('active');
    slides[this.currentIndex]?.classList.add('prev');

    setTimeout(() => {
      slides[this.currentIndex]?.classList.remove('prev');
    }, 650);

    this.currentIndex = index;
    slides[this.currentIndex]?.classList.add('active');

    dots.forEach((d, i) => d.classList.toggle('active', i === index));

    this.resetProgress();
    setTimeout(() => { this.isAnimating = false; }, 650);
  }

  next() {
    this.goTo((this.currentIndex + 1) % this.banners.length);
  }

  prev() {
    this.goTo((this.currentIndex - 1 + this.banners.length) % this.banners.length);
  }

  startAutoPlay() {
    this.stopAutoPlay();
    const interval = this.settings.autoPlayInterval || 4000;

    const progress = document.getElementById('bannerProgress');
    if (progress) {
      progress.style.transition = 'none';
      progress.style.width = '0%';
      void progress.offsetWidth;
      progress.style.transition = `width ${interval}ms linear`;
      progress.style.width = '100%';
    }

    this.autoPlayTimer = setTimeout(() => {
      this.next();
      this.startAutoPlay();
    }, interval);
  }

  stopAutoPlay() {
    clearTimeout(this.autoPlayTimer);
    const progress = document.getElementById('bannerProgress');
    if (progress) {
      progress.style.transition = 'none';
      progress.style.width = '0%';
    }
  }

  resetProgress() {
    const progress = document.getElementById('bannerProgress');
    if (progress) {
      progress.style.transition = 'none';
      progress.style.width = '0%';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('heroBannerSlider')) {
    new BannerSlider('heroBannerSlider');
  }
});
