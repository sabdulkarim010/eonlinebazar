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

  render() {
    const h = this.settings.height || '420px';
    const mh = this.settings.mobileHeight || '220px';

    this.container.innerHTML = `
      <style>
        #bannerSliderWrap {
          position: relative;
          width: 100%;
          height: ${h};
          overflow: hidden;
          background: #1a1a2e;
        }
        @media(max-width:768px) {
          #bannerSliderWrap { height: ${mh}; }
        }
        .banner-slide {
          position: absolute;
          inset: 0;
          opacity: 0;
          transition: opacity 0.6s ease, transform 0.6s ease;
          transform: translateX(100%);
        }
        .banner-slide.active {
          opacity: 1;
          transform: translateX(0);
          z-index: 2;
        }
        .banner-slide.prev {
          opacity: 0;
          transform: translateX(-100%);
          z-index: 1;
        }
        .banner-slide.fade-mode { transform: none !important; }

        .banner-bg {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center;
          display: block;
        }

        .banner-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0,0,0,var(--opacity, 0.3));
          z-index: 1;
        }

        .banner-content {
          position: absolute;
          inset: 0;
          z-index: 2;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 20px;
        }

        .banner-title {
          font-size: clamp(1.2rem, 4vw, 2.4rem);
          font-weight: 800;
          line-height: 1.2;
          margin-bottom: 8px;
          text-shadow: 0 2px 8px rgba(0,0,0,0.4);
        }

        .banner-subtitle {
          font-size: clamp(0.8rem, 2vw, 1.1rem);
          font-weight: 400;
          opacity: 0.85;
          margin-bottom: 20px;
          text-shadow: 0 1px 4px rgba(0,0,0,0.3);
        }

        .banner-cta {
          display: inline-block;
          padding: 12px 28px;
          background: #f97316;
          color: white;
          border-radius: 30px;
          font-size: 0.9rem;
          font-weight: 700;
          text-decoration: none;
          transition: all 0.2s;
          box-shadow: 0 4px 16px rgba(249,115,22,0.4);
        }
        .banner-cta:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(249,115,22,0.5);
        }

        .banner-arrow {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          z-index: 10;
          width: 44px;
          height: 44px;
          background: rgba(255,255,255,0.15);
          backdrop-filter: blur(4px);
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: 50%;
          color: white;
          font-size: 1.1rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
          user-select: none;
        }
        .banner-arrow:hover {
          background: rgba(249,115,22,0.7);
          border-color: transparent;
        }
        .banner-arrow-prev { left: 14px; }
        .banner-arrow-next { right: 14px; }

        @media(max-width:480px) {
          .banner-arrow {
            width: 36px; height: 36px; font-size: 0.9rem;
          }
        }

        .banner-dots {
          position: absolute;
          bottom: 14px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          gap: 6px;
          z-index: 10;
        }

        .banner-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: rgba(255,255,255,0.4);
          cursor: pointer;
          transition: all 0.3s;
          border: none;
          padding: 0;
        }
        .banner-dot.active {
          background: #f97316;
          width: 24px;
          border-radius: 4px;
        }

        .banner-progress {
          position: absolute;
          bottom: 0;
          left: 0;
          height: 3px;
          background: #f97316;
          z-index: 10;
          width: 0%;
          transition: width linear;
        }

        .banner-fallback {
          width: 100%;
          min-height: 180px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          background: #1a1a2e;
          color: #fff;
          padding: 24px;
        }
        .banner-fallback h2 {
          margin: 0 0 8px;
          font-size: clamp(1.2rem, 4vw, 2rem);
          font-weight: 800;
        }
        .banner-fallback p {
          margin: 0;
          opacity: 0.85;
        }
      </style>

      <div id="bannerSliderWrap">
        ${this.banners.map((b, i) => `
          <div class="banner-slide ${i === 0 ? 'active' : ''}
               ${this.settings.transitionEffect === 'fade' ? 'fade-mode' : ''}"
               data-index="${i}">
            <picture>
              ${b.mobileImageUrl ? `
                <source media="(max-width: 768px)"
                        srcset="${this.escapeHtml(b.mobileImageUrl)}">
              ` : ''}
              <img class="banner-bg"
                   src="${this.escapeHtml(b.imageUrl)}"
                   alt="${this.escapeHtml(b.title || 'Banner')}"
                   loading="${i === 0 ? 'eager' : 'lazy'}">
            </picture>
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
      // Force reflow so width reset applies before animating
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
