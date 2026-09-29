/**
 * PDP desktop hover zoom + accessible full-screen lightbox.
 */
(function initPdpGalleryEnhancements(global) {
    'use strict';

    const DESKTOP_ZOOM_MQ = '(min-width: 992px) and (hover: hover) and (pointer: fine)';
    const ZOOM_SCALE = 2.2;
    const LENS_SIZE = 120;

    let lightboxEl = null;
    let lightboxOpen = false;
    let focusBeforeOpen = null;
    let zoomHost = null;
    let zoomLens = null;
    let zoomPane = null;
    let rafPending = false;
    let pendingZoomEvent = null;
    let keydownHandler = null;
    let carouselClickHandler = null;

    function getImages() {
        return Array.isArray(global.galleryImagesCache) ? global.galleryImagesCache : [];
    }

    function getActiveIndex() {
        return Number(global.activeGalleryIndex) || 0;
    }

    function resolveHiResUrl(url) {
        const IU = global.EOBImageUtils;
        if (IU && typeof IU.buildResponsiveUrl === 'function') {
            return IU.buildResponsiveUrl(url, 960) || url;
        }
        return url;
    }

    function getActiveSlideImage() {
        const track = global.getCarouselTrackEl ? global.getCarouselTrackEl() : null;
        const idx = getActiveIndex();
        if (track) {
            const img = track.querySelector(
                `.product-image-carousel__slide[data-slide-index="${idx}"] img`
            );
            if (img) return img;
        }
        return global.getMainProductImageEl ? global.getMainProductImageEl() : null;
    }

    function isDesktopZoomEnabled() {
        return typeof global.matchMedia === 'function' && global.matchMedia(DESKTOP_ZOOM_MQ).matches;
    }

    function ensureZoomElements() {
        const mainBox = document.querySelector('.main-image-box');
        if (!mainBox) return null;

        mainBox.classList.add('pdp-enhanced');

        if (!zoomHost) {
            zoomHost = document.createElement('div');
            zoomHost.className = 'pdp-zoom-host';
            zoomHost.setAttribute('aria-hidden', 'true');

            zoomPane = document.createElement('div');
            zoomPane.className = 'pdp-zoom-pane';

            zoomLens = document.createElement('div');
            zoomLens.className = 'pdp-zoom-lens';

            zoomHost.appendChild(zoomPane);
            zoomHost.appendChild(zoomLens);
            mainBox.appendChild(zoomHost);
        }
        return mainBox;
    }

    function hideZoom() {
        if (zoomHost) zoomHost.classList.remove('is-active');
        if (zoomLens) zoomLens.style.transform = 'translate3d(-9999px,-9999px,0)';
    }

    function applyZoomFrame(clientX, clientY) {
        if (!isDesktopZoomEnabled() || lightboxOpen) {
            hideZoom();
            return;
        }

        const mainBox = document.querySelector('.main-image-box');
        const img = getActiveSlideImage();
        if (!mainBox || !img || !zoomHost || !zoomLens || !zoomPane) return;

        const boxRect = mainBox.getBoundingClientRect();
        const imgRect = img.getBoundingClientRect();
        if (imgRect.width < 40 || imgRect.height < 40) {
            hideZoom();
            return;
        }

        const x = clientX - imgRect.left;
        const y = clientY - imgRect.top;
        if (x < 0 || y < 0 || x > imgRect.width || y > imgRect.height) {
            hideZoom();
            return;
        }

        const src = resolveHiResUrl(img.dataset.imageUrl || img.currentSrc || img.src);
        zoomPane.style.backgroundImage = `url("${src.replace(/"/g, '\\"')}")`;

        const lensHalf = LENS_SIZE / 2;
        let lensX = x - lensHalf;
        let lensY = y - lensHalf;
        lensX = Math.max(0, Math.min(imgRect.width - LENS_SIZE, lensX));
        lensY = Math.max(0, Math.min(imgRect.height - LENS_SIZE, lensY));

        const offsetX = (lensX + lensHalf - imgRect.width / 2) / imgRect.width;
        const offsetY = (lensY + lensHalf - imgRect.height / 2) / imgRect.height;

        zoomLens.style.width = `${LENS_SIZE}px`;
        zoomLens.style.height = `${LENS_SIZE}px`;
        zoomLens.style.transform = `translate3d(${imgRect.left - boxRect.left + lensX}px, ${imgRect.top - boxRect.top + lensY}px, 0)`;

        const bgW = imgRect.width * ZOOM_SCALE;
        const bgH = imgRect.height * ZOOM_SCALE;
        zoomPane.style.backgroundSize = `${bgW}px ${bgH}px`;
        zoomPane.style.backgroundPosition = `${50 - offsetX * 100 * (ZOOM_SCALE - 1) / ZOOM_SCALE}% ${50 - offsetY * 100 * (ZOOM_SCALE - 1) / ZOOM_SCALE}%`;

        zoomHost.classList.add('is-active');
    }

    function onZoomMove(e) {
        pendingZoomEvent = { clientX: e.clientX, clientY: e.clientY };
        if (rafPending) return;
        rafPending = true;
        global.requestAnimationFrame(() => {
            rafPending = false;
            if (pendingZoomEvent) {
                applyZoomFrame(pendingZoomEvent.clientX, pendingZoomEvent.clientY);
            }
        });
    }

    function bindZoomHandlers() {
        const carousel = global.getCarouselEl ? global.getCarouselEl() : document.getElementById('productImageCarousel');
        const mainBox = ensureZoomElements();
        if (!carousel || !mainBox || carousel.dataset.pdpZoomBound === '1') return;
        carousel.dataset.pdpZoomBound = '1';

        carousel.addEventListener('mousemove', onZoomMove);
        carousel.addEventListener('mouseleave', hideZoom);
    }

    function ensureLightboxDom() {
        if (lightboxEl) return lightboxEl;

        lightboxEl = document.createElement('div');
        lightboxEl.id = 'pdpLightbox';
        lightboxEl.className = 'pdp-lightbox';
        lightboxEl.setAttribute('role', 'dialog');
        lightboxEl.setAttribute('aria-modal', 'true');
        lightboxEl.setAttribute('aria-label', 'Product image gallery');
        lightboxEl.hidden = true;

        lightboxEl.innerHTML = `
            <div class="pdp-lightbox__backdrop" data-pdp-lightbox-close tabindex="-1"></div>
            <div class="pdp-lightbox__panel">
                <button type="button" class="pdp-lightbox__close" aria-label="Close gallery">&times;</button>
                <button type="button" class="pdp-lightbox__nav pdp-lightbox__nav--prev" aria-label="Previous image">
                    <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
                </button>
                <figure class="pdp-lightbox__stage-wrap">
                    <img class="pdp-lightbox__stage" alt="" decoding="async" />
                    <figcaption class="pdp-lightbox__counter" aria-live="polite">1 / 1</figcaption>
                </figure>
                <button type="button" class="pdp-lightbox__nav pdp-lightbox__nav--next" aria-label="Next image">
                    <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
                </button>
                <div class="pdp-lightbox__thumbs" role="tablist" aria-label="Gallery thumbnails"></div>
            </div>`;

        document.body.appendChild(lightboxEl);
        return lightboxEl;
    }

    function renderLightboxThumbs() {
        const thumbs = lightboxEl?.querySelector('.pdp-lightbox__thumbs');
        if (!thumbs) return;
        const images = getImages();
        thumbs.innerHTML = '';

        images.forEach((url, index) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'pdp-lightbox__thumb';
            btn.setAttribute('role', 'tab');
            btn.setAttribute('aria-label', `Image ${index + 1}`);
            btn.dataset.index = String(index);
            const display = typeof global.resolveDisplayImageUrl === 'function'
                ? global.resolveDisplayImageUrl(url) || url
                : url;
            btn.innerHTML = `<img src="${display.replace(/"/g, '&quot;')}" alt="" loading="lazy" decoding="async" width="64" height="64" />`;
            if (index === getActiveIndex()) btn.classList.add('is-active');
            btn.addEventListener('click', () => {
                goLightboxIndex(index);
            });
            thumbs.appendChild(btn);
        });
    }

    function paintLightboxStage(index) {
        if (!lightboxEl) return;
        const images = getImages();
        if (!images.length) return;

        const safe = Math.max(0, Math.min(index, images.length - 1));
        const url = images[safe];
        const display = typeof global.resolveDisplayImageUrl === 'function'
            ? global.resolveDisplayImageUrl(url) || url
            : url;
        const hi = resolveHiResUrl(display);

        const stage = lightboxEl.querySelector('.pdp-lightbox__stage');
        const counter = lightboxEl.querySelector('.pdp-lightbox__counter');
        const prev = lightboxEl.querySelector('.pdp-lightbox__nav--prev');
        const next = lightboxEl.querySelector('.pdp-lightbox__nav--next');

        if (stage) {
            stage.src = hi;
            stage.alt = `${global.currentProductData?.name || 'Product'} — image ${safe + 1}`;
            if (global.EOBImageUtils?.applyToImgElement) {
                global.EOBImageUtils.applyToImgElement(stage, {
                    src: hi,
                    variant: 'detail',
                    alt: stage.alt,
                    priority: safe === 0 ? 'lcp' : 'lazy'
                });
            } else {
                stage.loading = safe === 0 ? 'eager' : 'lazy';
            }
        }
        if (counter) counter.textContent = `${safe + 1} / ${images.length}`;
        if (prev) prev.disabled = safe <= 0;
        if (next) next.disabled = safe >= images.length - 1;

        lightboxEl.querySelectorAll('.pdp-lightbox__thumb').forEach((thumb) => {
            thumb.classList.toggle('is-active', Number(thumb.dataset.index) === safe);
        });

        global.activeGalleryIndex = safe;
        return safe;
    }

    function updateLightboxStage(index, options = {}) {
        const safe = paintLightboxStage(index);
        if (safe == null) return;
        if (options.syncCarousel !== false && typeof global.goToGalleryIndex === 'function') {
            global.goToGalleryIndex(safe, { skipScrollAnimation: true, syncColor: false });
        }
    }

    function goLightboxIndex(index) {
        updateLightboxStage(index);
    }

    function trapFocus(e) {
        if (!lightboxOpen || !lightboxEl) return;
        if (e.key !== 'Tab') return;

        const focusables = lightboxEl.querySelectorAll(
            'button:not([disabled]), .pdp-lightbox__thumb:not([disabled])'
        );
        if (!focusables.length) return;

        const list = Array.from(focusables);
        const first = list[0];
        const last = list[list.length - 1];

        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }

    function onLightboxKeydown(e) {
        if (!lightboxOpen) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            closeLightbox();
            return;
        }
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            goLightboxIndex(getActiveIndex() - 1);
            return;
        }
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            goLightboxIndex(getActiveIndex() + 1);
        }
    }

    function bindLightboxControls() {
        ensureLightboxDom();
        if (lightboxEl.dataset.bound === '1') return;
        lightboxEl.dataset.bound = '1';

        lightboxEl.querySelector('.pdp-lightbox__close')?.addEventListener('click', closeLightbox);
        lightboxEl.querySelector('[data-pdp-lightbox-close]')?.addEventListener('click', closeLightbox);
        lightboxEl.querySelector('.pdp-lightbox__nav--prev')?.addEventListener('click', () => {
            goLightboxIndex(getActiveIndex() - 1);
        });
        lightboxEl.querySelector('.pdp-lightbox__nav--next')?.addEventListener('click', () => {
            goLightboxIndex(getActiveIndex() + 1);
        });

        keydownHandler = (e) => {
            onLightboxKeydown(e);
            trapFocus(e);
        };
    }

    function openLightbox(index) {
        const images = getImages();
        if (!images.length) return;

        ensureLightboxDom();
        bindLightboxControls();

        focusBeforeOpen = document.activeElement;
        lightboxOpen = true;
        hideZoom();

        lightboxEl.hidden = false;
        document.body.classList.add('pdp-lightbox-open');

        renderLightboxThumbs();
        updateLightboxStage(Number.isFinite(index) ? index : getActiveIndex());

        global.addEventListener('keydown', keydownHandler);
        lightboxEl.querySelector('.pdp-lightbox__close')?.focus();
    }

    function closeLightbox() {
        if (!lightboxEl) return;
        lightboxOpen = false;
        lightboxEl.hidden = true;
        document.body.classList.remove('pdp-lightbox-open');
        if (keydownHandler) global.removeEventListener('keydown', keydownHandler);
        if (focusBeforeOpen && typeof focusBeforeOpen.focus === 'function') {
            focusBeforeOpen.focus();
        }
    }

    function bindCarouselOpenLightbox() {
        const carousel = global.getCarouselEl ? global.getCarouselEl() : null;
        if (!carousel || carousel.dataset.pdpLightboxClick === '1') return;
        carousel.dataset.pdpLightboxClick = '1';

        carouselClickHandler = (e) => {
            if (e.target.closest('.product-carousel-nav')) return;
            const img = e.target.closest('.product-image-carousel__slide img');
            if (!img) return;
            e.preventDefault();
            openLightbox(getActiveIndex());
        };
        carousel.addEventListener('click', carouselClickHandler);
    }

    function mount() {
        if (!getImages().length) return;
        ensureZoomElements();
        bindZoomHandlers();
        bindCarouselOpenLightbox();
        bindLightboxControls();
    }

    function onGalleryUpdated() {
        hideZoom();
        if (lightboxOpen) {
            renderLightboxThumbs();
            updateLightboxStage(getActiveIndex());
        }
    }

    function onIndexChange(index) {
        if (lightboxOpen) {
            paintLightboxStage(index);
        } else {
            hideZoom();
        }
    }

    function syncImagesFromVariant(nextImages) {
        if (!Array.isArray(nextImages)) return;
        global.galleryImagesCache = nextImages.slice();
        onGalleryUpdated();
    }

    global.PdpGalleryEnhancements = {
        mount,
        openLightbox,
        closeLightbox,
        isLightboxOpen: () => lightboxOpen,
        onGalleryUpdated,
        onIndexChange,
        syncImagesFromVariant,
        hideZoom,
        isDesktopZoomEnabled,
        _applyZoomFrame: applyZoomFrame
    };
})(typeof window !== 'undefined' ? window : global);
