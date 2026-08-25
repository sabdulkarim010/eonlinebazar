/**
 * PDP Gallery
 * Barrel: client/js/product-details.js
 *
 * Globals used from other modules:
 *  * - currentProductData
 * - selectedCombinationAttrs
 * - selectedVariantsByAttr
 * - matchedCombinationVariant
 * - syncColorVariantFromGallery
 *
 * Globals this module exposes:
 *  * - galleryImagesCache
 * - activeGalleryIndex
 * - carouselScrollLock
 * - getProductImages
 * - getMainProductImageEl
 * - normalizeImageUrl
 * - resolveGalleryIndexForUrl
 * - buildColorImageDataAttrs
 * - getCarouselEl
 * - getCarouselTrackEl
 * - clearDetailsMediaFallback
 * - renderDetailsMediaFallback
 * - attachMainImageFallback
 * - syncThumbnailActiveState
 * - updateStickyBarImage
 * - updateCarouselNavButtons
 * - setupCarouselScrollSync
 * - setupCarouselNavButtons
 * - initProductImageCarousel
 * - goToGalleryIndex
 * - setMainProductImage
 * - syncColorVariantFromGallery
 * - setupGalleryDelegation
 * - renderProductImages
 */

window.galleryImagesCache = [];
window.activeGalleryIndex = 0;
window.carouselScrollLock = false;

function getProductImages(product) {
    const PT = window.ProductThumbnail;
    if (PT && typeof PT.pickAllValidImages === 'function') {
        const valid = PT.pickAllValidImages(product);
        if (valid.length > 0) {
            return valid.map((url) => resolveDisplayImageUrl(url) || url);
        }
    }
    return [];
}

/** Supports carousel active slide and legacy single-image ids */
function getMainProductImageEl() {
    const track = getCarouselTrackEl();
    if (track && galleryImagesCache.length) {
        const activeSlide = track.querySelector(
            `.product-image-carousel__slide[data-slide-index="${activeGalleryIndex}"] img`
        );
        if (activeSlide) return activeSlide;
    }
    return document.getElementById('mainProductImg')
        || document.getElementById('mainProductImage');
}

function normalizeImageUrl(url) {
    if (!url) return '';
    const raw = String(url).trim().split('?')[0];
    try {
        if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('/')) {
            return new URL(raw, window.location.origin).pathname;
        }
    } catch (e) { /* fall through */ }
    return raw;
}

function resolveGalleryIndexForUrl(images, url, fallbackIndex = 0) {
    if (!Array.isArray(images) || !images.length || !url) return fallbackIndex;
    const target = normalizeImageUrl(url);
    const idx = images.findIndex((img) => normalizeImageUrl(img) === target);
    return idx >= 0 ? idx : fallbackIndex;
}

function buildColorImageDataAttrs(imageUrl, mapEntry) {
    if (!imageUrl) return '';
    let attrs = ` data-image="${escapeHtml(imageUrl)}" data-image-url="${escapeHtml(imageUrl)}"`;
    if (mapEntry && Number.isInteger(mapEntry.index)) {
        attrs += ` data-image-index="${mapEntry.index}" data-color-index="${mapEntry.index}" data-index="${mapEntry.index}"`;
    }
    return attrs;
}

function getCarouselEl() {
    return document.getElementById('productImageCarousel');
}

function getCarouselTrackEl() {
    return document.getElementById('productImageCarouselTrack');
}

function clearDetailsMediaFallback(mainBox) {
    if (!mainBox) return;
    mainBox.querySelectorAll('.product-details-media-fallback').forEach((el) => el.remove());
}

function renderDetailsMediaFallback(product, mainBox) {
    const PT = window.ProductThumbnail;
    if (!mainBox || !PT) return;

    clearDetailsMediaFallback(mainBox);

    const wrap = document.createElement('div');
    wrap.className = 'product-details-media-fallback';
    wrap.innerHTML = PT.buildThumbnailHtml(product, { variant: 'detail', alt: product.name || 'Product' });
    mainBox.appendChild(wrap);
}

function attachMainImageFallback(mainImg, product, mainBox) {
    if (!mainImg) return;

    const PT = window.ProductThumbnail;
    if (PT && typeof PT.attachImageFallback === 'function') {
        PT.attachImageFallback(mainImg);
        return;
    }

    mainImg.onerror = function () {
        this.onerror = null;
        this.style.display = 'none';
        renderDetailsMediaFallback(product, mainBox);
    };
}

function syncThumbnailActiveState(imageUrl, colorIndex) {
    const thumbs = document.querySelectorAll('.thumb-img');
    if (!thumbs.length) return;

    let matchedIndex = -1;
    if (Number.isInteger(colorIndex) && colorIndex >= 0) {
        matchedIndex = colorIndex;
    } else if (imageUrl && currentProductData) {
        const images = getProductImages(currentProductData);
        matchedIndex = images.findIndex((url) => url === imageUrl);
        if (matchedIndex < 0) {
            const entry = Object.values(getColorImageMap(currentProductData))
                .find((e) => e.url === imageUrl);
            if (entry) matchedIndex = entry.index;
        }
    }

    thumbs.forEach((thumb, index) => {
        const thumbUrl = thumb.dataset.imageUrl || thumb.dataset.fullUrl || thumb.getAttribute('src') || '';
        const isActive = matchedIndex >= 0
            ? index === matchedIndex
            : normalizeImageUrl(thumbUrl) === normalizeImageUrl(imageUrl);
        thumb.classList.toggle('active', isActive);
    });
}

function updateStickyBarImage(imageUrl) {
    const stickyImg = document.getElementById('stickyBarImg');
    if (!stickyImg || !imageUrl) return;
    const displayUrl = resolveDisplayImageUrl(imageUrl) || imageUrl;
    stickyImg.style.display = '';
    stickyImg.src = displayUrl;
    const PT = window.ProductThumbnail;
    if (PT && typeof PT.attachImageFallback === 'function') {
        PT.attachImageFallback(stickyImg);
    } else {
        stickyImg.onerror = function () {
            this.style.display = 'none';
        };
    }
}

function updateCarouselNavButtons() {
    const prevBtn = document.getElementById('productCarouselPrev');
    const nextBtn = document.getElementById('productCarouselNext');
    const hasMultiple = galleryImagesCache.length > 1;

    if (prevBtn) {
        prevBtn.hidden = !hasMultiple;
        prevBtn.disabled = activeGalleryIndex <= 0;
    }
    if (nextBtn) {
        nextBtn.hidden = !hasMultiple;
        nextBtn.disabled = activeGalleryIndex >= galleryImagesCache.length - 1;
    }
}

function setupCarouselScrollSync() {
    const carousel = getCarouselEl();
    if (!carousel || carousel.dataset.scrollBound === '1') return;
    carousel.dataset.scrollBound = '1';

    let scrollTimer = null;
    carousel.addEventListener('scroll', () => {
        if (carouselScrollLock) return;

        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
            const slideWidth = carousel.clientWidth || 1;
            const index = Math.max(0, Math.min(
                galleryImagesCache.length - 1,
                Math.round(carousel.scrollLeft / slideWidth)
            ));

            if (index === activeGalleryIndex) return;

            activeGalleryIndex = index;
            const url = galleryImagesCache[index];
            syncThumbnailActiveState(url, index);
            updateStickyBarImage(url);
            updateCarouselNavButtons();

            if (currentProductData) {
                const colorEntry = getImageIndexToColorMap(currentProductData)[index];
                if (colorEntry?.colorValue) {
                    syncColorVariantFromGallery(colorEntry.colorValue);
                }
            }
        }, 80);
    }, { passive: true });
}

function setupCarouselNavButtons() {
    const prevBtn = document.getElementById('productCarouselPrev');
    const nextBtn = document.getElementById('productCarouselNext');
    if (!prevBtn || !nextBtn || prevBtn.dataset.bound === '1') return;
    prevBtn.dataset.bound = '1';
    nextBtn.dataset.bound = '1';

    prevBtn.addEventListener('click', () => {
        goToGalleryIndex(activeGalleryIndex - 1);
    });
    nextBtn.addEventListener('click', () => {
        goToGalleryIndex(activeGalleryIndex + 1);
    });

    const carousel = getCarouselEl();
    if (carousel) {
        carousel.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                goToGalleryIndex(activeGalleryIndex - 1);
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                goToGalleryIndex(activeGalleryIndex + 1);
            }
        });
    }
}

function initProductImageCarousel(product, imagesArray) {
    galleryImagesCache = imagesArray.slice();
    activeGalleryIndex = 0;

    const carousel = getCarouselEl();
    const track = getCarouselTrackEl();
    const mainBox = document.querySelector('.main-image-box');
    if (!carousel || !track) return;

    track.innerHTML = '';

    imagesArray.forEach((imgUrl, index) => {
        const slide = document.createElement('div');
        slide.className = 'product-image-carousel__slide';
        slide.dataset.slideIndex = String(index);

        const img = document.createElement('img');
        const displayUrl = resolveDisplayImageUrl(imgUrl) || imgUrl;
        img.src = displayUrl;
        img.dataset.imageUrl = displayUrl;
        img.alt = `${product.name || 'Product'} — image ${index + 1}`;
        if (index === 0) {
            img.id = 'mainProductImg';
            img.setAttribute('data-role', 'main-product-image');
        }
        img.loading = index === 0 ? 'eager' : 'lazy';
        img.draggable = false;
        attachMainImageFallback(img, product, mainBox);

        slide.appendChild(img);
        track.appendChild(slide);
    });

    setupCarouselScrollSync();
    updateCarouselNavButtons();

    if (!carousel.dataset.resizeBound) {
        carousel.dataset.resizeBound = '1';
        window.addEventListener('resize', () => {
            if (!galleryImagesCache.length) return;
            goToGalleryIndex(activeGalleryIndex, { skipScrollAnimation: true, syncColor: false });
        });
    }

    goToGalleryIndex(0, { skipScrollAnimation: true, syncColor: false });
}

function goToGalleryIndex(index, options = {}) {
    const images = galleryImagesCache;
    if (!images.length) return;

    const safeIndex = Math.max(0, Math.min(Number(index) || 0, images.length - 1));
    activeGalleryIndex = safeIndex;
    const url = images[safeIndex];

    const carousel = getCarouselEl();
    if (carousel) {
        carouselScrollLock = true;
        const slideWidth = carousel.clientWidth || carousel.offsetWidth || 1;
        carousel.scrollTo({
            left: safeIndex * slideWidth,
            behavior: options.skipScrollAnimation ? 'auto' : 'smooth'
        });
        window.setTimeout(() => {
            carouselScrollLock = false;
        }, options.skipScrollAnimation ? 0 : 320);
    }

    syncThumbnailActiveState(url, safeIndex);
    updateStickyBarImage(url);
    updateCarouselNavButtons();

    if (options.syncColor !== false && currentProductData) {
        const colorEntry = getImageIndexToColorMap(currentProductData)[safeIndex];
        if (colorEntry?.colorValue) {
            syncColorVariantFromGallery(colorEntry.colorValue);
        }
    }
}

/** Swap main carousel slide + sticky image instantly */
function setMainProductImage(imageUrl, colorIndex) {
    if (!imageUrl && !Number.isInteger(colorIndex)) return;

    if (galleryImagesCache.length && getCarouselEl()) {
        let targetIndex = colorIndex;
        if (!Number.isInteger(targetIndex) || targetIndex < 0) {
            targetIndex = resolveGalleryIndexForUrl(galleryImagesCache, imageUrl, activeGalleryIndex);
        }
        goToGalleryIndex(targetIndex, { syncColor: false });
        return;
    }

    const mainImg = getMainProductImageEl();
    const mainBox = document.querySelector('.main-image-box');

    if (mainImg && imageUrl) {
        const displayUrl = resolveDisplayImageUrl(imageUrl) || imageUrl;
        mainImg.style.display = '';
        mainImg.src = displayUrl;
        mainImg.dataset.imageUrl = displayUrl;
        if (currentProductData) attachMainImageFallback(mainImg, currentProductData, mainBox);
    }
    updateStickyBarImage(imageUrl);
    clearDetailsMediaFallback(mainBox);
    syncThumbnailActiveState(imageUrl, colorIndex);
}

function syncColorVariantFromGallery(colorValue) {
    if (!colorValue || !currentProductData) return;

    const wrap = document.getElementById('variantSelectorWrap');
    if (!wrap) return;

    if (wrap.dataset.matrixMode === '1') {
        const groups = VU().extractAttributeGroups
            ? VU().extractAttributeGroups(matrixVariantsCache)
            : [];
        const colorGroup = groups.find((g) => isColorAttribute(g.name));
        const colorAttrName = colorGroup?.name || 'Color';
        const badge = wrap.querySelector(
            `.variant-badge[data-combo-attr="${cssEscape(colorAttrName)}"][data-combo-value="${cssEscape(colorValue)}"]`
        );
        if (badge && !badge.classList.contains('is-disabled')) {
            if (badge.classList.contains('is-active')) return;
            selectCombinationAttribute(colorAttrName, colorValue, badge);
        }
        return;
    }

    const variants = Array.isArray(currentProductData.variants) ? currentProductData.variants : [];
    const variant = variants.find((v) => {
        if (isColorAttribute(v.attribute)) {
            return String(v.value || '').trim().toLowerCase() === String(colorValue).trim().toLowerCase();
        }
        const attrs = getVariantAttrs(v);
        const colorKey = Object.keys(attrs).find((k) => isColorAttribute(k));
        return colorKey && String(attrs[colorKey]).trim().toLowerCase() === String(colorValue).trim().toLowerCase();
    });
    if (variant) selectVariantOption(variant);
}

/** Single delegated listener — survives gallery re-renders after product fetch */
function setupGalleryDelegation() {
    const gallery = document.getElementById('thumbGallery');
    if (!gallery || gallery.dataset.galleryBound === '1') return;
    gallery.dataset.galleryBound = '1';

    gallery.addEventListener('click', (e) => {
        const thumb = e.target.closest('.thumb-img');
        if (!thumb) return;

        const imgUrl = thumb.dataset.imageUrl || thumb.dataset.fullUrl || thumb.getAttribute('src') || '';
        if (!imgUrl) return;

        const parsedIndex = parseInt(thumb.dataset.imageIndex, 10);
        const imageIndex = Number.isFinite(parsedIndex) ? parsedIndex : undefined;

        if (galleryImagesCache.length && getCarouselEl()) {
            goToGalleryIndex(imageIndex ?? resolveGalleryIndexForUrl(galleryImagesCache, imgUrl, 0), {
                syncColor: false
            });
        } else {
            setMainProductImage(imgUrl, imageIndex);
        }

        const colorValue = thumb.dataset.colorValue;
        if (colorValue) {
            syncColorVariantFromGallery(colorValue);
        }
    });

    gallery.addEventListener('keydown', (e) => {
        const thumb = e.target.closest('.thumb-img');
        if (!thumb || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        thumb.click();
    });
}

function renderProductImages(product) {
    const gallery = document.getElementById('thumbGallery');
    const mainBox = document.querySelector('.main-image-box');
    const stickyImg = document.getElementById('stickyBarImg');

    clearDetailsMediaFallback(mainBox);

    const imagesArray = getProductImages(product);
    const indexToColor = getImageIndexToColorMap(product);

    galleryImagesCache = [];
    activeGalleryIndex = 0;

    if (imagesArray.length === 0) {
        const track = getCarouselTrackEl();
        if (track) track.innerHTML = '';
        if (stickyImg) {
            stickyImg.style.display = 'none';
            stickyImg.removeAttribute('src');
        }
        if (gallery) gallery.innerHTML = '';
        updateCarouselNavButtons();
        renderDetailsMediaFallback(product, mainBox);
        return;
    }

    initProductImageCarousel(product, imagesArray);

    if (gallery) {
        gallery.innerHTML = '';

        imagesArray.forEach((imgUrl, index) => {
            const displayUrl = resolveDisplayImageUrl(imgUrl) || imgUrl;
            const imgBtn = document.createElement('img');
            imgBtn.src = displayUrl;
            imgBtn.classList.add('thumb-img');
            imgBtn.dataset.imageIndex = String(index);
            imgBtn.dataset.index = String(index);
            imgBtn.dataset.imageUrl = displayUrl;
            imgBtn.dataset.fullUrl = displayUrl;
            imgBtn.setAttribute('role', 'button');
            imgBtn.setAttribute('tabindex', '0');
            imgBtn.setAttribute('aria-label', `View product image ${index + 1}`);

            const PT = window.ProductThumbnail;
            if (PT && typeof PT.attachImageFallback === 'function') {
                PT.attachImageFallback(imgBtn);
            }

            const colorEntry = indexToColor[index];
            if (colorEntry) {
                const colorLabel = colorEntry.colorValue || colorEntry.variant?.value || '';
                imgBtn.dataset.colorValue = colorLabel;
                imgBtn.title = colorLabel;
            }

            if (index === 0) imgBtn.classList.add('active');

            gallery.appendChild(imgBtn);
        });
    }
}
Object.assign(window, {
    getProductImages,
    getMainProductImageEl,
    normalizeImageUrl,
    resolveGalleryIndexForUrl,
    buildColorImageDataAttrs,
    getCarouselEl,
    getCarouselTrackEl,
    clearDetailsMediaFallback,
    renderDetailsMediaFallback,
    attachMainImageFallback,
    syncThumbnailActiveState,
    updateStickyBarImage,
    updateCarouselNavButtons,
    setupCarouselScrollSync,
    setupCarouselNavButtons,
    initProductImageCarousel,
    goToGalleryIndex,
    setMainProductImage,
    syncColorVariantFromGallery,
    setupGalleryDelegation,
    renderProductImages
});
