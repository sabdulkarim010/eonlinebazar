/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/catalog-categories.js
 * Description: Manage Categories tree UI and admin CRUD.
 */
import '../admin-core.js';
/* ==========================================================================
   SECTION 9.4: MANAGE CATEGORIES (tree UI + admin CRUD)
   NOTE: admin.js is loaded as type="module" — every handler used by HTML
   onclick/oninput MUST be assigned to window (same pattern as brands).
   ========================================================================== */

/* shared state: allCategories lives on window (admin-core) */

/* shared state: editingCategoryId lives on window (admin-core) */

/* shared state: categorySortable lives on window (admin-core) */

function getAdminAuthToken() {
    return localStorage.getItem('adminToken') || token || '';
}

/** Alias used by category row onclick handlers */
function getAuthToken() {
    return getAdminAuthToken();
}
window.getAuthToken = getAuthToken;

async function loadCategories() {
    const authToken = getAdminAuthToken();

    try {
        const res = await fetch('/api/categories/admin/all', {
            headers: { 'Authorization': 'Bearer ' + authToken }
        });

        if (!res.ok) {
            console.error('Categories API error:', res.status, res.statusText);
            const text = await res.text();
            console.error('Response:', text);
            let data = {};
            try { data = JSON.parse(text); } catch (_) { /* non-JSON */ }
            if (handleAdminApiAuthResponse(res, data) !== 'ok') return;
            showToast('Failed to load categories: ' + res.status, 'error');
            return;
        }

        const data = await res.json();
        console.log('Categories loaded:', data);

        if (handleAdminApiAuthResponse(res, data) !== 'ok') return;

        if (data.success) {
            allCategories = data.data || [];
            globalCategories = allCategories;
            renderCategoryTree(allCategories);
            updateCategoryStats(allCategories);
            populateParentDropdown(allCategories);
            renderCategoryDropdown();
        } else {
            showToast(data.message || 'Failed to load categories', 'error');
        }
    } catch (err) {
        console.error('loadCategories error:', err);
        showToast('Network error loading categories', 'error');
    }
}
window.loadCategories = loadCategories;

function updateCategoryStats(cats) {
    const el = id => document.getElementById(id);
    if (el('catTotalCount')) el('catTotalCount').textContent = cats.length;
    if (el('catActiveCount')) el('catActiveCount').textContent = cats.filter(c => c.isActive !== false).length;
    if (el('catFeaturedCount')) el('catFeaturedCount').textContent = cats.filter(c => c.isFeatured === true).length;
    // Strict true — do not count undefined/default as "In Navbar"
    if (el('catNavbarCount')) el('catNavbarCount').textContent = cats.filter(c => c.showInNavbar === true).length;
}

function populateParentDropdown(cats) {
    const sel = document.getElementById('catParent');
    if (!sel) return;
    const parents = (cats || []).filter(c => !c.parentCategory);
    sel.innerHTML = '<option value="">None (Top-level)</option>' +
        parents.map(c => `<option value="${c._id}">${escHtml(c.name)}</option>`).join('');
    if (editingCategoryId) {
        // Don't allow setting itself as parent
        const opt = sel.querySelector(`option[value="${editingCategoryId}"]`);
        if (opt) opt.remove();
    }
}

function sortCatsByPosition(a, b) {
    const pa = Number(a.position) || 0;
    const pb = Number(b.position) || 0;
    if (pa !== pb) return pa - pb;
    return String(a.name || '').localeCompare(String(b.name || ''));
}

function buildCategoryRowHtml(cat) {
    const isSub = !!cat.parentCategory;
    const parentName = cat.parentCategory?.name || '';
    const imgSrc = cat.imageUrl || cat.image || '';
    const color = escHtml(cat.color || '#f97316');
    const safeName = escHtml(cat.name || '');
    const safeId = escHtml(String(cat._id));
    const safeSlug = cat.slug ? escHtml(cat.slug) : '';
    const nameAttr = safeName.replace(/'/g, '&#39;');
    const isActive = cat.isActive !== false;

    const imgHtml = imgSrc
        ? `<img class="cat-row-thumb" src="${escHtml(imgSrc)}" alt="${safeName}"
               style="border-color:${color}"
               onerror="this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='flex'">`
        : '';

    return `
  <div class="category-row${isSub ? ' is-sub' : ''}" data-id="${safeId}">
    <span class="drag-handle" title="Drag to reorder">⠿</span>
    ${imgHtml}
    <div class="cat-color-avatar" style="
      background:${color};
      display:${imgSrc ? 'none' : 'flex'};">
      ${isSub ? '↳' : '🏷️'}
    </div>
    <div class="cat-row-info">
      <div class="cat-row-title">
        ${isSub
          ? `<span class="cat-row-parent-hint">↳ ${escHtml(parentName)}</span>`
          : ''}
        <span class="cat-row-name">${safeName}</span>
        ${cat.isFeatured ? '<span class="cat-mini-badge cb-featured">★ FEATURED</span>' : ''}
        ${cat.showInNavbar === true ? '<span class="cat-mini-badge cb-navbar">NAV</span>' : ''}
        ${cat.showInHomepage ? '<span class="cat-mini-badge cb-homepage">HOME</span>' : ''}
        ${!isActive ? '<span class="cat-mini-badge cb-inactive">Inactive</span>' : ''}
      </div>
      <div class="cat-row-meta">
        ${cat.productCount || 0} products${safeSlug ? ` · /${safeSlug}` : ''}
      </div>
    </div>
    <label class="toggle-switch" title="${isActive ? 'Active' : 'Inactive'}"
           onclick="event.stopPropagation()">
      <input type="checkbox" ${isActive ? 'checked' : ''}
             onchange="toggleCategoryActive('${safeId}', this.checked)">
      <span class="toggle-slider"></span>
    </label>
    <div class="cat-row-actions" onclick="event.stopPropagation()">
      <button type="button" class="action-icon edit"
              onclick="openEditCategory('${safeId}')" title="Edit">✏️</button>
      <button type="button" class="action-icon delete"
              onclick="deleteCategory('${safeId}','${nameAttr}')" title="Delete">🗑️</button>
    </div>
  </div>`;
}

function initCategorySortable(container) {
    if (categorySortable) {
        try { categorySortable.destroy(); } catch (_) { /* ignore */ }
        categorySortable = null;
    }
    if (!container || typeof Sortable === 'undefined') return;

    categorySortable = Sortable.create(container, {
        handle: '.drag-handle',
        animation: 150,
        ghostClass: 'sortable-ghost',
        draggable: '.category-row',
        onEnd: async function() {
            const items = container.querySelectorAll('.category-row[data-id]');
            const order = Array.from(items).map((el, index) => ({
                id: el.dataset.id,
                position: index
            }));

            try {
                const res = await fetch('/api/categories/admin/reorder', {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + getAdminAuthToken()
                    },
                    body: JSON.stringify({ order })
                });
                const data = await res.json();
                if (handleAdminApiAuthResponse(res, data) !== 'ok') {
                    loadCategories();
                    return;
                }
                if (data.success) {
                    showToast('Category order saved!', 'success');
                    // Keep local positions in sync without full reload flicker
                    order.forEach(item => {
                        const cat = allCategories.find(c => String(c._id) === String(item.id));
                        if (cat) cat.position = item.position;
                    });
                } else {
                    showToast(data.message || 'Failed to save order', 'error');
                    loadCategories();
                }
            } catch (err) {
                console.error('Category reorder error:', err);
                showToast('Network error saving order', 'error');
                loadCategories();
            }
        }
    });
}

function renderCategoryTree(cats) {
    const container = document.getElementById('categoryTree');
    if (!container) return;

    if (categorySortable) {
        try { categorySortable.destroy(); } catch (_) { /* ignore */ }
        categorySortable = null;
    }

    const parents = cats.filter(c => !c.parentCategory).sort(sortCatsByPosition);
    const children = cats.filter(c => c.parentCategory).sort(sortCatsByPosition);

    if (!parents.length && !children.length) {
        container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🗂️</div>
        <h3>No categories yet</h3>
        <p>Click "+ Add Category" to create your first category.</p>
      </div>`;
        return;
    }

    // Flat ordered list: each parent followed by its subs (visual hierarchy via CSS)
    let ordered = [];
    if (parents.length) {
        parents.forEach(parent => {
            ordered.push(parent);
            children
                .filter(c =>
                    String(c.parentCategory) === String(parent._id) ||
                    String(c.parentCategory?._id) === String(parent._id)
                )
                .forEach(sub => ordered.push(sub));
        });
        // Orphan subs whose parent is not in the filtered set
        const shownIds = new Set(ordered.map(c => String(c._id)));
        children.forEach(sub => {
            if (!shownIds.has(String(sub._id))) ordered.push(sub);
        });
    } else {
        ordered = children;
    }

    container.innerHTML = ordered.map(buildCategoryRowHtml).join('');
    initCategorySortable(container);
}

window.toggleCatChildren = function(id) {
    const el = document.getElementById(id);
    if (el) {
        el.style.display = (el.style.display === 'none' ? '' : 'none');
    }
};

window.filterCategories = function() {
    const search = (document.getElementById('catSearch')?.value || '').toLowerCase();
    const typeFilter = document.getElementById('catFilterParent')?.value || 'all';
    const statusFilter = document.getElementById('catFilterStatus')?.value || 'all';

    const filtered = allCategories.filter(c => {
        const matchSearch = !search || (c.name || '').toLowerCase().includes(search);
        const matchType = typeFilter === 'all' ? true :
                          typeFilter === 'parent' ? !c.parentCategory :
                          !!c.parentCategory;
        const matchStatus = statusFilter === 'all' ? true :
                            statusFilter === 'active' ? c.isActive !== false :
                            c.isActive === false;
        return matchSearch && matchType && matchStatus;
    });

    renderCategoryTree(filtered);
};

function fillCategoryModal(cat) {
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val ?? '';
    };
    const check = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.checked = !!val;
    };

    set('catName', cat.name);
    set('catDescription', cat.description);
    set('catCashback', cat.customCashback ?? cat.customCashbackPercentage ?? '');
    set('catPosition', cat.position || 0);
    set('catColor', cat.color || '#f97316');
    set('catColorHex', cat.color || '#f97316');
    set('catMetaTitle', cat.metaTitle);
    set('catMetaDesc', cat.metaDescription);

    check('catIsActive', cat.isActive !== false);
    check('catIsFeatured', cat.isFeatured);
    // Strict boolean — matches stats / NAV badge (do not treat undefined as true)
    check('catShowNavbar', cat.showInNavbar === true);
    check('catShowHomepage', cat.showInHomepage);

    const parentId = cat.parentCategory?._id || cat.parentCategory || '';
    set('catParent', parentId);

    if (cat.imageUrl) {
        const preview = document.getElementById('catImgPreview');
        if (preview) {
            preview.innerHTML =
                `<img src="${escHtml(cat.imageUrl)}" class="banner-preview-img" alt="${escHtml(cat.name)}">`;
        }
        const zone = document.getElementById('catImgZone');
        if (zone) zone.classList.add('has-image');
    }
}

window.closeCategoryModal = function() {
    closeModal('categoryModal');
};

// Aliases — same shared modal for Add and Edit
window.closeAddCategoryModal = window.closeCategoryModal;
window.closeEditCategoryModal = window.closeCategoryModal;
window.openAddCategoryModal = function() { return window.openCategoryModal(); };

window.openCategoryModal = async function(catId = null) {
    editingCategoryId = catId || null;
    const modal = document.getElementById('categoryModal');
    if (!modal) {
        console.error('categoryModal not found in DOM');
        return;
    }

    // Reset all form fields
    const fieldIds = ['catName', 'catDescription', 'catCashback',
                      'catPosition', 'catMetaTitle', 'catMetaDesc'];
    fieldIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    const colorEl = document.getElementById('catColor');
    const colorHexEl = document.getElementById('catColorHex');
    if (colorEl) colorEl.value = '#f97316';
    if (colorHexEl) colorHexEl.value = '#f97316';

    const activeEl = document.getElementById('catIsActive');
    if (activeEl) activeEl.checked = true;

    ['catIsFeatured', 'catShowHomepage'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.checked = false;
    });
    const navEl = document.getElementById('catShowNavbar');
    if (navEl) navEl.checked = true;

    const parentEl = document.getElementById('catParent');
    if (parentEl) parentEl.value = '';

    const imgPreview = document.getElementById('catImgPreview');
    if (imgPreview) {
        imgPreview.innerHTML =
            '<span style="font-size:1.5rem">🖼️</span><p style="font-size:0.78rem;color:#64748b;margin:4px 0">Click to upload</p>';
    }

    const imgZone = document.getElementById('catImgZone');
    if (imgZone) imgZone.classList.remove('has-image');

    const imgFile = document.getElementById('catImageFile');
    if (imgFile) imgFile.value = '';

    populateParentDropdown(allCategories);

    const title = document.getElementById('catModalTitle');
    const icon = document.getElementById('catModalIcon');
    const saveBtn = document.getElementById('saveCatBtn');

    if (catId) {
        if (icon) icon.textContent = '✏️';
        if (title) title.textContent = 'Edit Category';
        if (saveBtn) saveBtn.textContent = '💾 Update Category';
        modal.classList.add('open');
        try {
            const authToken = getAdminAuthToken();
            const res = await fetch('/api/categories/admin/' + catId, {
                headers: { 'Authorization': 'Bearer ' + authToken }
            });
            const data = await res.json();
            if (handleAdminApiAuthResponse(res, data) !== 'ok') return;
            if (data.success && data.data) {
                fillCategoryModal(data.data);
            } else {
                const fallback = allCategories.find(c => String(c._id) === String(catId));
                if (fallback) fillCategoryModal(fallback);
                else showToast(data.message || 'Category not found', 'error');
            }
        } catch (err) {
            console.error('editCategory load error:', err);
            const fallback = allCategories.find(c => String(c._id) === String(catId));
            if (fallback) fillCategoryModal(fallback);
            else showToast('Error: ' + err.message, 'error');
        }
        return;
    }

    if (icon) icon.textContent = '➕';
    if (title) title.textContent = 'Add New Category';
    if (saveBtn) saveBtn.textContent = '💾 Save Category';
    modal.classList.add('open');
};

window.editCategory = function(id) { window.openCategoryModal(id); };
window.openEditCategory = function(id) { window.openCategoryModal(id); };

// Close category modal with Escape
document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape') return;
    const modal = document.getElementById('categoryModal');
    if (modal && modal.classList.contains('open')) {
        closeCategoryModal();
    }
});

window.toggleCategoryActive = async function(categoryId, isActive) {
    try {
        const res = await fetch('/api/categories/admin/' + categoryId, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + getAdminAuthToken()
            },
            body: JSON.stringify({ isActive })
        });
        const data = await res.json();
        if (handleAdminApiAuthResponse(res, data) !== 'ok') {
            loadCategories();
            return;
        }
        if (data.success) {
            showToast('Category ' + (isActive ? 'activated' : 'deactivated'), 'success');
            await loadCategories();
        } else {
            showToast(data.message || 'Update failed', 'error');
            await loadCategories();
        }
    } catch (err) {
        console.error('toggleCategoryActive error:', err);
        showToast('Network error', 'error');
        await loadCategories();
    }
};

window.previewCatImg = function(input) {
    const file = input?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        const preview = document.getElementById('catImgPreview');
        if (preview) {
            preview.innerHTML = `<img src="${e.target.result}" class="banner-preview-img">`;
        }
        const zone = document.getElementById('catImgZone');
        if (zone) zone.classList.add('has-image');
    };
    reader.readAsDataURL(file);
};

window.saveCategory = async function() {
    const name = document.getElementById('catName')?.value?.trim();
    if (!name) {
        showToast('Category name is required', 'error');
        return;
    }

    const authToken = getAdminAuthToken();
    const btn = document.getElementById('saveCatBtn');
    const idleLabel = editingCategoryId ? '💾 Update Category' : '💾 Save Category';
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Saving...'; }

    const formData = new FormData();
    formData.append('name', name);
    formData.append('description', document.getElementById('catDescription')?.value || '');
    formData.append('parentCategory', document.getElementById('catParent')?.value || '');
    formData.append('color', document.getElementById('catColor')?.value || '#f97316');
    formData.append('isActive', String(document.getElementById('catIsActive')?.checked !== false));
    formData.append('isFeatured', String(!!document.getElementById('catIsFeatured')?.checked));
    formData.append('showInNavbar', String(!!document.getElementById('catShowNavbar')?.checked));
    formData.append('showInHomepage', String(!!document.getElementById('catShowHomepage')?.checked));
    formData.append('position', document.getElementById('catPosition')?.value || '0');
    formData.append('customCashback', document.getElementById('catCashback')?.value || '');
    formData.append('metaTitle', document.getElementById('catMetaTitle')?.value || '');
    formData.append('metaDescription', document.getElementById('catMetaDesc')?.value || '');

    const imgFile = document.getElementById('catImageFile')?.files?.[0];
    if (imgFile) formData.append('categoryImage', imgFile);

    try {
        const url = editingCategoryId
            ? '/api/categories/admin/' + editingCategoryId
            : '/api/categories/admin';
        const method = editingCategoryId ? 'PATCH' : 'POST';

        console.log('Saving category:', method, url);

        const res = await fetch(url, {
            method,
            headers: { 'Authorization': 'Bearer ' + authToken },
            body: formData
        });

        const data = await res.json();
        console.log('Save category response:', data);

        if (handleAdminApiAuthResponse(res, data) !== 'ok') return;

        if (data.success) {
            showToast(editingCategoryId ? '✅ Category updated!' : '✅ Category created!', 'success');
            closeCategoryModal();
            await loadCategories();
            if (typeof fetchCategories === 'function') await fetchCategories();
        } else {
            showToast(data.message || 'Save failed', 'error');
        }
    } catch (err) {
        console.error('saveCategory error:', err);
        showToast('Error: ' + err.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = idleLabel; }
    }
};

// Custom confirm dialog — replaces browser confirm()
function showDeleteConfirm(message, onConfirm) {
    const modal = document.getElementById('confirmDeleteModal');
    const msgEl = document.getElementById('confirmDeleteMsg');
    const btn = document.getElementById('confirmDeleteBtn');

    if (!modal || !msgEl || !btn) {
        // Fallback to browser confirm if modal not found
        if (confirm(message)) onConfirm();
        return;
    }

    msgEl.textContent = message;

    // Remove old listener and add new one
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener('click', () => {
        closeModal('confirmDeleteModal');
        onConfirm();
    });

    modal.classList.add('open');
}

window.deleteCategory = async function(categoryId, categoryName) {
    if (typeof Swal === 'undefined') {
        // Fallback if SweetAlert2 failed to load
        showDeleteConfirm(
            'Delete category "' + categoryName + '"?\n\nSub-categories will also be deleted. Products must be reassigned first.',
            () => performCategoryDelete(categoryId)
        );
        return;
    }

    const result = await Swal.fire({
        title: 'Delete "' + categoryName + '"?',
        html: `<p style="color:#64748b;font-size:14px;">
      This will also delete all sub-categories.<br>
      Products must be reassigned first.
    </p>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: '🗑️ Yes, Delete',
        cancelButtonText: 'Cancel',
        reverseButtons: true
    });

    if (!result.isConfirmed) return;
    await performCategoryDelete(categoryId);
};

async function performCategoryDelete(categoryId) {
    try {
        const res = await fetch('/api/categories/admin/' + categoryId, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + getAdminAuthToken() }
        });
        const data = await res.json();

        if (handleAdminApiAuthResponse(res, data) !== 'ok') return;

        if (data.success) {
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    title: 'Deleted!',
                    text: data.message || 'Category deleted',
                    icon: 'success',
                    timer: 2000,
                    showConfirmButton: false
                });
            } else {
                showToast('✅ Category deleted', 'success');
            }
            await loadCategories();
            if (typeof fetchCategories === 'function') await fetchCategories();
        } else if (typeof Swal !== 'undefined') {
            Swal.fire('Cannot Delete', data.message || 'Cannot delete', 'error');
        } else {
            showToast(data.message || 'Cannot delete', 'error');
        }
    } catch (err) {
        console.error('deleteCategory error:', err);
        if (typeof Swal !== 'undefined') {
            Swal.fire('Error', 'Network error while deleting', 'error');
        } else {
            showToast('Error: ' + err.message, 'error');
        }
    }
}

/* Expose module functions for HTML onclick + cross-module calls */
Object.assign(window, {
    getAdminAuthToken,
    getAuthToken,
    loadCategories,
    updateCategoryStats,
    populateParentDropdown,
    sortCatsByPosition,
    buildCategoryRowHtml,
    initCategorySortable,
    renderCategoryTree,
    fillCategoryModal,
    showDeleteConfirm,
    performCategoryDelete
});
