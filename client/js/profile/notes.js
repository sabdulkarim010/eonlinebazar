/**
 * EonlineBazar Profile — Notes & Expenses Premium Notebook
 * Barrel: client/js/profile.js
 *
 * Globals: window.NotesModule, window.openNewNoteModal, window.fetchNotes
 */

const NotesModule = (() => {
    const API = '/api/notes';
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const TYPE_LABELS = { note: '📝 Note', general: '📝 Note', expense: '💸 Expense', income: '📈 Income', shopping: '🛒 Shopping' };
    const NOTE_LIKE = { note: true, general: true };

    let notes = [];
    let currentFilter = 'all';
    let searchQuery = '';
    let editingNoteId = null;
    let currentTags = [];
    let selectedColor = '#FFFEF0';
    let selectedCategory = 'food';
    let shoppingItems = [];
    let currentMonth = new Date().getMonth();
    let currentYear = new Date().getFullYear();
    let bound = false;

    function token() {
        return window.profileAuthToken
            || localStorage.getItem('token')
            || localStorage.getItem('customerToken')
            || localStorage.getItem('userToken')
            || '';
    }

    function escapeHtml(str) {
        if (typeof window.profileEscapeHtml === 'function') return window.profileEscapeHtml(str);
        return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function el(id) { return document.getElementById(id); }

    function headers() {
        return { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' };
    }

    function bnNum(n) { return Number(n || 0).toLocaleString('en-US'); }

    function taka(n) { return '৳' + bnNum(Math.abs(Number(n) || 0)); }

    function toast(title, icon = 'success') {
        if (typeof window.Swal === 'object' && typeof window.Swal.fire === 'function') {
            window.Swal.fire({ toast: true, position: 'top-end', icon, title, showConfirmButton: false, timer: 2200 });
            return;
        }
        if (typeof window.profileShowToast === 'function') window.profileShowToast(title, icon === 'success' ? 'success' : 'danger');
    }

    function noteType(note) {
        return NOTE_LIKE[note.type] ? 'note' : note.type;
    }

    async function loadNotes() {
        const grid = el('notesGrid');
        if (!grid || !token()) return;
        try {
            const res = await fetch(`${API}?limit=200`, { headers: headers() });
            const data = await res.json();
            if (res.ok && data.success) {
                notes = data.notes || [];
                renderNotes();
                updateBudgetSummary();
            }
        } catch (err) {
            console.error('Failed to load notes:', err);
        }
    }

    async function saveNote(noteData) {
        const url = editingNoteId ? `${API}/${editingNoteId}` : API;
        try {
            const res = await fetch(url, {
                method: editingNoteId ? 'PUT' : 'POST',
                headers: headers(),
                body: JSON.stringify(noteData)
            });
            const data = await res.json();
            if (res.ok && data.success) {
                closeNoteModal();
                await loadNotes();
                toast(data.message || 'Note saved successfully');
            } else {
                toast(data.message || 'Could not save note', 'error');
            }
        } catch (err) {
            console.error('Failed to save note:', err);
            toast('Could not save note', 'error');
        }
    }

    async function deleteNote(id) {
        const ok = typeof window.Swal === 'object' && typeof window.Swal.fire === 'function'
            ? (await window.Swal.fire({
                title: 'Delete this note?',
                text: 'This cannot be undone.',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ef4444',
                confirmButtonText: 'Yes, delete',
                cancelButtonText: 'Cancel'
            })).isConfirmed
            : window.confirm('Delete this note?');
        if (!ok) return;
        try {
            const res = await fetch(`${API}/${id}`, { method: 'DELETE', headers: headers() });
            const data = await res.json();
            if (res.ok && data.success) {
                await loadNotes();
                toast(data.message || 'Note deleted');
            } else {
                toast(data.message || 'Could not delete note', 'error');
            }
        } catch (err) {
            console.error('Failed to delete note:', err);
            toast('Could not delete note', 'error');
        }
    }

    function renderNotes() {
        const grid = el('notesGrid');
        const empty = el('notesEmpty');
        if (!grid) return;

        const filtered = notes.filter((note) => {
            const type = noteType(note);
            const matchFilter = currentFilter === 'all'
                || (currentFilter === 'pinned' && note.pinned)
                || (currentFilter === 'note' && NOTE_LIKE[note.type])
                || type === currentFilter;
            const q = searchQuery;
            const matchSearch = !q
                || (note.title || '').toLowerCase().includes(q)
                || (note.content || '').toLowerCase().includes(q)
                || (note.tags || []).some((t) => String(t).toLowerCase().includes(q));
            return matchFilter && matchSearch;
        }).sort((a, b) => {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            return new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt);
        });

        if (!filtered.length) {
            grid.innerHTML = '';
            if (empty) empty.classList.remove('hidden');
            return;
        }
        if (empty) empty.classList.add('hidden');
        grid.innerHTML = filtered.map(renderNoteCard).join('');
    }

    function renderNoteCard(note) {
        const type = noteType(note);
        const dateStr = new Date(note.date || note.createdAt).toLocaleDateString('en-US', {
            day: 'numeric', month: 'short', year: 'numeric'
        });
        const amountHtml = (type === 'expense' || type === 'income') && note.amount != null
            ? `<div class="nb-card-amount">${taka(note.amount)}</div>` : '';
        const items = note.shoppingItems || [];
        const shoppingHtml = type === 'shopping' && items.length
            ? `<div class="nb-shopping-items-preview">${items.slice(0, 3).map((item) => `
                <div class="nb-shop-item-row">
                    <span class="nb-shop-item-check${item.checked ? ' checked' : ''}">${item.checked ? '✓' : ''}</span>
                    <span>${escapeHtml(item.name)}</span>
                    ${item.price ? `<span style="margin-left:auto;color:#16a34a;font-weight:600">${taka(item.price)}</span>` : ''}
                </div>`).join('')}
                ${items.length > 3 ? `<div class="nb-shop-more">+${bnNum(items.length - 3)} more items</div>` : ''}
              </div>` : '';
        const tagsHtml = (note.tags || []).length
            ? `<div class="nb-card-tags">${note.tags.map((t) => `<span class="nb-tag">#${escapeHtml(t)}</span>`).join('')}</div>` : '';
        const contentHtml = note.content ? `<div class="nb-card-content">${escapeHtml(note.content)}</div>` : '';

        return `<article class="nb-card type-${escapeHtml(type)}" data-note-id="${escapeHtml(note._id)}" style="background:${escapeHtml(note.color || '#FFFEF0')}">
            <div class="nb-card-header">
                <span class="nb-card-type-badge">${TYPE_LABELS[type] || TYPE_LABELS.note}</span>
                ${note.pinned ? '<span class="nb-card-pin">📌</span>' : ''}
            </div>
            <h3 class="nb-card-title">${escapeHtml(note.title || 'Untitled')}</h3>
            ${amountHtml}${shoppingHtml}${contentHtml}${tagsHtml}
            <div class="nb-card-footer">
                <span class="nb-card-date">${escapeHtml(dateStr)}</span>
                <div class="nb-card-actions">
                    <button type="button" class="nb-action-btn" data-note-edit="${escapeHtml(note._id)}" aria-label="Edit">✏️</button>
                    <button type="button" class="nb-action-btn delete" data-note-delete="${escapeHtml(note._id)}" aria-label="Delete">🗑️</button>
                </div>
            </div>
        </article>`;
    }

    function updateBudgetSummary() {
        const monthNotes = notes.filter((n) => {
            const d = new Date(n.date || n.createdAt);
            return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        });
        const income = monthNotes.filter((n) => n.type === 'income').reduce((s, n) => s + (Number(n.amount) || 0), 0);
        const expense = monthNotes.filter((n) => n.type === 'expense').reduce((s, n) => s + (Number(n.amount) || 0), 0);
        const savings = income - expense;
        const pct = income > 0 ? Math.min((expense / income) * 100, 100) : 0;

        if (el('totalIncome')) el('totalIncome').textContent = taka(income);
        if (el('totalExpense')) el('totalExpense').textContent = taka(expense);
        if (el('totalSavings')) {
            el('totalSavings').textContent = taka(savings);
            el('totalSavings').style.color = savings >= 0 ? '#16a34a' : '#dc2626';
        }
        if (el('budgetProgressFill')) el('budgetProgressFill').style.width = `${pct}%`;
        if (el('budgetProgressLabel')) el('budgetProgressLabel').textContent = `${Math.round(pct)}% of budget used`;
        if (el('budgetPeriodLabel')) el('budgetPeriodLabel').textContent = `${MONTHS[currentMonth]} ${bnNum(currentYear)}`;
    }

    function formatDateDisplay(iso) {
        const d = iso ? new Date(iso) : new Date();
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }

    function setNoteType(type) {
        document.querySelectorAll('.nb-type-btn').forEach((btn) => {
            btn.classList.toggle('active', btn.getAttribute('data-type') === type);
        });
        const money = type === 'expense' || type === 'income';
        el('amountSection')?.classList.toggle('hidden', !money);
        el('shoppingSection')?.classList.toggle('hidden', type !== 'shopping');
        if (type === 'shopping' && !shoppingItems.length) {
            shoppingItems = [{ name: '', price: 0, checked: false }];
            renderShoppingItems();
        }
    }

    function getCurrentType() {
        return document.querySelector('.nb-type-btn.active')?.getAttribute('data-type') || 'note';
    }

    function applyNoteColor(color) {
        const modal = document.querySelector('.nb-modal.notebook-page');
        if (modal) modal.style.backgroundColor = color;
    }

    function applyModalColor(color) {
        selectedColor = color || '#FFFEF0';
        applyNoteColor(selectedColor);
        const selected = String(selectedColor).toLowerCase();
        document.querySelectorAll('.nb-color-dot').forEach((dot) => {
            dot.classList.toggle('active', String(dot.getAttribute('data-color') || '').toLowerCase() === selected);
        });
        const custom = el('customColorInput');
        if (custom && /^#[0-9a-fA-F]{6}$/.test(selectedColor)) custom.value = selectedColor;
    }

    function setCategory(cat) {
        selectedCategory = cat || 'other';
        document.querySelectorAll('.nb-chip').forEach((chip) => {
            chip.classList.toggle('active', chip.getAttribute('data-category') === selectedCategory);
        });
    }

    function renderTags() {
        const list = el('noteTagsList');
        if (!list) return;
        list.innerHTML = currentTags.map((tag) => `
            <span class="nb-tag-item">#${escapeHtml(tag)}
                <button type="button" class="nb-tag-remove" data-remove-tag="${escapeHtml(tag)}">✕</button>
            </span>`).join('');
    }

    function addTag(raw) {
        const t = String(raw || '').trim().replace(/\s+/g, '-').toLowerCase();
        if (t && !currentTags.includes(t) && currentTags.length < 10) {
            currentTags.push(t);
            renderTags();
        }
    }

    function removeTag(tag) {
        currentTags = currentTags.filter((t) => t !== tag);
        renderTags();
    }

    function renderShoppingItems() {
        const container = el('shoppingItems');
        if (!container) return;
        container.innerHTML = shoppingItems.map((item, i) => `
            <div class="nb-shop-item" data-shop-index="${i}">
                <input type="text" value="${escapeHtml(item.name || '')}" placeholder="Item name" data-shop-field="name">
                <input type="number" value="${item.price || ''}" placeholder="Price" min="0" step="0.01" data-shop-field="price">
                <button type="button" class="nb-shop-remove" data-shop-remove="${i}">✕</button>
            </div>`).join('');
        updateShoppingTotal();
    }

    function addShoppingItem() {
        shoppingItems.push({ name: '', price: 0, checked: false });
        renderShoppingItems();
        const inputs = document.querySelectorAll('#shoppingItems input[type="text"]');
        if (inputs.length) inputs[inputs.length - 1].focus();
    }

    function updateShopItem(index, field, value) {
        if (!shoppingItems[index]) return;
        shoppingItems[index][field] = field === 'price' ? Number(value) : value;
        if (field === 'price') updateShoppingTotal();
    }

    function removeShopItem(index) {
        shoppingItems.splice(index, 1);
        renderShoppingItems();
    }

    function updateShoppingTotal() {
        const total = shoppingItems.reduce((s, i) => s + (Number(i.price) || 0), 0);
        if (el('shoppingTotal')) el('shoppingTotal').textContent = taka(total);
    }

    function updateCharCount() {
        const content = el('noteContent');
        if (el('charCount') && content) el('charCount').textContent = `${content.value.length} characters`;
    }

    function resetModal() {
        if (el('noteTitle')) el('noteTitle').value = '';
        if (el('noteContent')) el('noteContent').value = '';
        if (el('noteAmount')) el('noteAmount').value = '';
        if (el('notePinned')) el('notePinned').checked = false;
        if (el('noteTagInput')) el('noteTagInput').value = '';
        currentTags = [];
        shoppingItems = [];
        selectedCategory = 'food';
        applyModalColor('#FFFEF0');
        setCategory('food');
        renderTags();
        renderShoppingItems();
        updateCharCount();
    }

    function openNewModal(type = 'note') {
        editingNoteId = null;
        resetModal();
        setNoteType(type);
        const today = new Date().toISOString().slice(0, 10);
        if (el('noteDate')) el('noteDate').value = today;
        if (el('noteDateDisplay')) el('noteDateDisplay').textContent = formatDateDisplay(today);
        el('noteModal')?.classList.remove('hidden');
        el('noteTitle')?.focus();
    }

    function openEditModal(id) {
        const note = notes.find((n) => String(n._id) === String(id));
        if (!note) return;
        editingNoteId = note._id;
        currentTags = [...(note.tags || [])];
        shoppingItems = (note.shoppingItems || []).map((i) => ({ ...i }));
        setNoteType(noteType(note));
        applyModalColor(note.color);
        setCategory(note.category || 'other');
        if (el('noteTitle')) el('noteTitle').value = note.title || '';
        if (el('noteContent')) el('noteContent').value = note.content || '';
        if (el('noteAmount')) el('noteAmount').value = note.amount || '';
        if (el('notePinned')) el('notePinned').checked = Boolean(note.pinned);
        const iso = (note.date || note.createdAt || '').toString().slice(0, 10);
        if (el('noteDate')) el('noteDate').value = iso;
        if (el('noteDateDisplay')) el('noteDateDisplay').textContent = formatDateDisplay(note.date || note.createdAt);
        renderTags();
        renderShoppingItems();
        updateCharCount();
        el('noteModal')?.classList.remove('hidden');
    }

    function closeNoteModal() {
        el('noteModal')?.classList.add('hidden');
        resetModal();
        editingNoteId = null;
    }

    function handleSave() {
        const title = el('noteTitle')?.value?.trim();
        if (!title) { el('noteTitle')?.focus(); return; }
        const type = getCurrentType();
        saveNote({
            title,
            content: el('noteContent')?.value?.trim() || '',
            type,
            amount: el('noteAmount')?.value ? Number(el('noteAmount').value) : null,
            category: selectedCategory,
            pinned: Boolean(el('notePinned')?.checked),
            color: selectedColor,
            tags: currentTags,
            shoppingItems: type === 'shopping' ? shoppingItems : [],
            date: el('noteDate')?.value || new Date().toISOString()
        });
    }

    function initEvents() {
        if (bound) return;
        bound = true;

        el('newNoteBtn')?.addEventListener('click', () => openNewModal('note'));
        el('newExpenseBtn')?.addEventListener('click', () => openNewModal('expense'));
        el('emptyNewNoteBtn')?.addEventListener('click', () => openNewModal('note'));
        el('closeNoteModal')?.addEventListener('click', closeNoteModal);
        el('cancelNoteBtn')?.addEventListener('click', closeNoteModal);
        el('saveNoteBtn')?.addEventListener('click', handleSave);
        el('addShoppingItem')?.addEventListener('click', addShoppingItem);
        el('noteContent')?.addEventListener('input', updateCharCount);
        el('noteModal')?.addEventListener('click', (e) => { if (e.target.id === 'noteModal') closeNoteModal(); });
        el('noteDate')?.addEventListener('change', () => {
            if (el('noteDateDisplay')) el('noteDateDisplay').textContent = formatDateDisplay(el('noteDate').value);
        });
        el('notesSearch')?.addEventListener('input', (e) => {
            searchQuery = (e.target.value || '').toLowerCase();
            renderNotes();
        });
        el('noteTagInput')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addTag(e.target.value);
                e.target.value = '';
            }
        });
        el('prevMonth')?.addEventListener('click', () => {
            currentMonth -= 1;
            if (currentMonth < 0) { currentMonth = 11; currentYear -= 1; }
            updateBudgetSummary();
        });
        el('nextMonth')?.addEventListener('click', () => {
            currentMonth += 1;
            if (currentMonth > 11) { currentMonth = 0; currentYear += 1; }
            updateBudgetSummary();
        });

        document.querySelectorAll('.nb-filter').forEach((btn) => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.nb-filter').forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');
                currentFilter = btn.getAttribute('data-filter') || 'all';
                renderNotes();
            });
        });
        document.querySelectorAll('.nb-type-btn').forEach((btn) => {
            btn.addEventListener('click', () => setNoteType(btn.getAttribute('data-type')));
        });
        document.querySelectorAll('.nb-chip').forEach((chip) => {
            chip.addEventListener('click', () => setCategory(chip.getAttribute('data-category')));
        });
        document.querySelectorAll('.nb-color-dot').forEach((dot) => {
            dot.addEventListener('click', () => {
                document.querySelectorAll('.nb-color-dot').forEach((d) => d.classList.remove('active'));
                dot.classList.add('active');
                selectedColor = dot.dataset.color;
                applyNoteColor(selectedColor);
            });
        });
        el('customColorInput')?.addEventListener('input', (e) => {
            selectedColor = e.target.value;
            document.querySelectorAll('.nb-color-dot').forEach((d) => d.classList.remove('active'));
            applyNoteColor(selectedColor);
        });

        el('notesGrid')?.addEventListener('click', (e) => {
            const del = e.target.closest('[data-note-delete]');
            const edit = e.target.closest('[data-note-edit]');
            const card = e.target.closest('[data-note-id]');
            if (del) { e.stopPropagation(); deleteNote(del.getAttribute('data-note-delete')); }
            else if (edit) { e.stopPropagation(); openEditModal(edit.getAttribute('data-note-edit')); }
            else if (card) openEditModal(card.getAttribute('data-note-id'));
        });
        el('noteTagsList')?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-remove-tag]');
            if (btn) removeTag(btn.getAttribute('data-remove-tag'));
        });
        el('shoppingItems')?.addEventListener('input', (e) => {
            const row = e.target.closest('[data-shop-index]');
            const field = e.target.getAttribute('data-shop-field');
            if (row && field) updateShopItem(Number(row.getAttribute('data-shop-index')), field, e.target.value);
        });
        el('shoppingItems')?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-shop-remove]');
            if (btn) removeShopItem(Number(btn.getAttribute('data-shop-remove')));
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && el('noteModal') && !el('noteModal').classList.contains('hidden')) closeNoteModal();
        });
    }

    function init() {
        initEvents();
        updateBudgetSummary();
        if (el('my-notes')?.classList.contains('active')) loadNotes();
    }

    return {
        init,
        loadNotes,
        deleteNote,
        openEditModal,
        openNewModal,
        removeTag,
        updateShopItem,
        removeShopItem,
        closeNoteModal
    };
})();

window.NotesModule = NotesModule;
window.openNewNoteModal = () => NotesModule.openNewModal('note');
window.fetchNotes = () => NotesModule.loadNotes();
window.profileNotes = NotesModule;

function bootNotesModule() {
    NotesModule.init();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootNotesModule);
} else {
    bootNotesModule();
}
