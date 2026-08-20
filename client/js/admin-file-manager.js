/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * Author: Abdul Karim
 * File: js/admin-file-manager.js
 * Description: Super Admin File Manager — directory tree, live search,
 * line-numbered syntax editor, save workflow, and password-gated delete.
 */

(function () {
    'use strict';

    const fmToken = () => localStorage.getItem('adminToken');

    let treeRoot = null;
    let flatIndex = [];
    let activePath = null;
    let activeType = null; // 'file' | 'folder'
    let openFolders = new Set();
    let dirty = false;
    let loadedContent = '';
    let searchQuery = '';
    let searchTimer = null;
    let highlightTimer = null;
    let uiBound = false;
    let deleteTargetPath = null;
    let deleteTargetType = null;
    let editorLocked = true;

    const JS_KEYWORDS = new Set([
        'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
        'delete', 'do', 'else', 'export', 'extends', 'false', 'finally', 'for',
        'function', 'if', 'import', 'in', 'instanceof', 'let', 'new', 'null',
        'return', 'static', 'super', 'switch', 'this', 'throw', 'true', 'try',
        'typeof', 'var', 'void', 'while', 'with', 'yield', 'async', 'await', 'of'
    ]);

    function notify(message, type = 'success') {
        if (typeof window.showToast === 'function') return window.showToast(message, type);
        console[type === 'error' ? 'error' : 'log'](message);
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[ch]));
    }

    async function fmApi(url, options = {}) {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${fmToken()}`,
                ...(options.headers || {})
            }
        });

        let data = {};
        try {
            data = await response.json();
        } catch (_) {
            data = {};
        }

        if (!response.ok || data.success === false) {
            const error = new Error(data.message || `Request failed (${response.status})`);
            error.status = response.status;
            error.payload = data;
            throw error;
        }

        return data;
    }

    function formatBytes(bytes) {
        const n = Number(bytes) || 0;
        if (n < 1024) return `${n} B`;
        if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
        if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
        return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }

    function basename(filePath) {
        const parts = String(filePath || '').split(/[/\\]/).filter(Boolean);
        return parts[parts.length - 1] || filePath || '';
    }

    function getExtension(filePath) {
        const name = basename(filePath);
        const idx = name.lastIndexOf('.');
        return idx > 0 ? name.slice(idx + 1).toLowerCase() : '';
    }

    function fileIconMeta(name, type) {
        if (type === 'folder') {
            return { icon: 'fa-solid fa-folder', cls: 'fm-icon--folder' };
        }
        const ext = String(name || '').split('.').pop().toLowerCase();
        switch (ext) {
            case 'js':
            case 'mjs':
            case 'cjs':
                return { icon: 'fa-brands fa-js', cls: 'fm-icon--js' };
            case 'html':
            case 'htm':
                return { icon: 'fa-brands fa-html5', cls: 'fm-icon--html' };
            case 'css':
            case 'scss':
            case 'sass':
                return { icon: 'fa-brands fa-css3-alt', cls: 'fm-icon--css' };
            case 'json':
                return { icon: 'fa-solid fa-file-code', cls: 'fm-icon--json' };
            case 'md':
            case 'markdown':
                return { icon: 'fa-brands fa-markdown', cls: 'fm-icon--md' };
            case 'svg':
            case 'png':
            case 'jpg':
            case 'jpeg':
            case 'gif':
            case 'webp':
                return { icon: 'fa-solid fa-image', cls: 'fm-icon--image' };
            default:
                return { icon: 'fa-regular fa-file-lines', cls: 'fm-icon--file' };
        }
    }

    function joinPath(parent, name) {
        const p = String(parent || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
        const n = String(name || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
        if (!p) return n;
        if (!n) return p;
        return `${p}/${n}`;
    }

    function collectStats(node, acc = { files: 0, folders: 0, size: 0 }) {
        if (!node) return acc;
        if (node.type === 'file') {
            acc.files += 1;
            acc.size += Number(node.size) || 0;
            return acc;
        }
        if (node.path !== '' && node.path != null) acc.folders += 1;
        (node.children || []).forEach((child) => collectStats(child, acc));
        return acc;
    }

    function buildFlatIndex(node, list = []) {
        if (!node) return list;
        if (node.path !== '' && node.path != null) {
            list.push({
                name: node.name,
                path: node.path,
                type: node.type,
                size: node.size || 0,
                extension: node.extension || ''
            });
        }
        (node.children || []).forEach((child) => buildFlatIndex(child, list));
        return list;
    }

    function updateStats() {
        const stats = collectStats(treeRoot);
        const filesEl = document.getElementById('fmStatFiles');
        const foldersEl = document.getElementById('fmStatFolders');
        const sizeEl = document.getElementById('fmStatSize');
        if (filesEl) filesEl.textContent = String(stats.files);
        if (foldersEl) foldersEl.textContent = String(stats.folders);
        if (sizeEl) sizeEl.textContent = formatBytes(stats.size);
    }

    function updateDeleteButton() {
        const deleteBtn = document.getElementById('fmDeleteBtn');
        if (deleteBtn) deleteBtn.disabled = !activePath;
    }

    function setEditorLocked(locked) {
        editorLocked = !!locked;
        const fileOpen = !!(activePath && activeType === 'file');
        const editor = document.getElementById('fmEditor');
        const shell = document.getElementById('fmCodeShell');
        const badge = document.getElementById('fmReadOnlyBadge');
        const toggleBtn = document.getElementById('fmEditToggleBtn');

        if (editor) {
            editor.readOnly = editorLocked;
            editor.classList.toggle('is-readonly', editorLocked);
        }
        if (shell) shell.classList.toggle('is-readonly', editorLocked && fileOpen);

        if (badge) {
            badge.hidden = !(fileOpen && editorLocked);
        }

        if (toggleBtn) {
            toggleBtn.disabled = !fileOpen;
            toggleBtn.classList.toggle('is-editing', fileOpen && !editorLocked);
            if (editorLocked) {
                toggleBtn.innerHTML = '<i class="fa-solid fa-pen"></i> Edit File';
                toggleBtn.title = 'Unlock editor to make changes';
                toggleBtn.setAttribute('aria-pressed', 'false');
            } else {
                toggleBtn.innerHTML = '<i class="fa-solid fa-lock"></i> Lock Editor';
                toggleBtn.title = 'Lock editor (read-only)';
                toggleBtn.setAttribute('aria-pressed', 'true');
            }
        }
    }

    function setDirty(next) {
        dirty = !!next;
        const status = document.getElementById('fmEditorStatus');
        const saveBtn = document.getElementById('fmSaveBtn');
        if (status) {
            status.textContent = dirty ? 'Unsaved changes' : (activePath && activeType === 'file' ? 'Saved' : '');
            status.classList.toggle('is-dirty', dirty);
        }
        if (saveBtn) saveBtn.disabled = !(activePath && activeType === 'file' && dirty);
        updateDeleteButton();
    }

    /* ======================================================================
       LIGHTWEIGHT SYNTAX HIGHLIGHT + LINE NUMBERS
       ====================================================================== */

    function highlightCode(source, ext) {
        const text = String(source ?? '');
        if (!text) return '';

        // Tokenize with placeholders so nested replacements don't re-highlight.
        const tokens = [];
        const stash = (html) => {
            const key = `\u0000${tokens.length}\u0000`;
            tokens.push(html);
            return key;
        };

        let working = text;

        if (ext === 'html' || ext === 'htm' || ext === 'svg' || ext === 'xml') {
            working = working.replace(/<!--[\s\S]*?-->/g, (m) => stash(`<span class="fm-tok-comment">${escapeHtml(m)}</span>`));
            working = working.replace(/<\/?[a-zA-Z][\w:-]*(?:\s[^<>]*?)?>/g, (tag) => {
                const colored = escapeHtml(tag)
                    .replace(/(&lt;\/?)([\w:-]+)/, '$1<span class="fm-tok-tag">$2</span>')
                    .replace(/([\w-:]+)=(&quot;[^&]*&quot;|&#39;[^&]*&#39;)/g, '<span class="fm-tok-attr">$1</span>=<span class="fm-tok-string">$2</span>');
                return stash(colored);
            });
        } else if (ext === 'css' || ext === 'scss' || ext === 'sass') {
            working = working.replace(/\/\*[\s\S]*?\*\//g, (m) => stash(`<span class="fm-tok-comment">${escapeHtml(m)}</span>`));
            working = working.replace(/#[0-9a-fA-F]{3,8}\b/g, (m) => stash(`<span class="fm-tok-number">${escapeHtml(m)}</span>`));
            working = working.replace(/([a-zA-Z-]+)(\s*:)/g, (_, prop, colon) => stash(`<span class="fm-tok-attr">${escapeHtml(prop)}</span>${colon}`));
        } else if (ext === 'json') {
            working = working.replace(/"(?:\\.|[^"\\])*"(?=\s*:)/g, (m) => stash(`<span class="fm-tok-attr">${escapeHtml(m)}</span>`));
            working = working.replace(/"(?:\\.|[^"\\])*"/g, (m) => stash(`<span class="fm-tok-string">${escapeHtml(m)}</span>`));
            working = working.replace(/\b(?:true|false|null)\b/g, (m) => stash(`<span class="fm-tok-keyword">${escapeHtml(m)}</span>`));
            working = working.replace(/\b-?\d+(?:\.\d+)?\b/g, (m) => stash(`<span class="fm-tok-number">${escapeHtml(m)}</span>`));
        } else {
            // JS / default
            working = working.replace(/\/\*[\s\S]*?\*\//g, (m) => stash(`<span class="fm-tok-comment">${escapeHtml(m)}</span>`));
            working = working.replace(/(^|[^:\\])\/\/.*$/gm, (m) => stash(`<span class="fm-tok-comment">${escapeHtml(m)}</span>`));
            working = working.replace(/`(?:\\.|[^`\\])*`/g, (m) => stash(`<span class="fm-tok-string">${escapeHtml(m)}</span>`));
            working = working.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g, (m) => stash(`<span class="fm-tok-string">${escapeHtml(m)}</span>`));
            working = working.replace(/\b(?:0x[\da-fA-F]+|\d+(?:\.\d+)?)\b/g, (m) => stash(`<span class="fm-tok-number">${escapeHtml(m)}</span>`));
            working = working.replace(/\b[A-Za-z_$][\w$]*\b/g, (word) => (
                JS_KEYWORDS.has(word)
                    ? stash(`<span class="fm-tok-keyword">${escapeHtml(word)}</span>`)
                    : word
            ));
        }

        let html = escapeHtml(working);
        html = html.replace(/\u0000(\d+)\u0000/g, (_, i) => tokens[Number(i)] || '');
        // Preserve trailing newline so highlight height matches textarea.
        if (text.endsWith('\n')) html += '\n';
        return html;
    }

    function syncLineNumbers(content) {
        const gutter = document.getElementById('fmGutter');
        if (!gutter) return;
        const lines = String(content ?? '').split('\n');
        const count = Math.max(lines.length, 1);
        let html = '';
        for (let i = 1; i <= count; i += 1) {
            html += `<span>${i}</span>`;
        }
        gutter.innerHTML = html;
    }

    function refreshHighlight() {
        const editor = document.getElementById('fmEditor');
        const codeEl = document.getElementById('fmHighlightCode');
        if (!editor || !codeEl) return;
        const ext = getExtension(activePath);
        codeEl.innerHTML = highlightCode(editor.value, ext);
        syncLineNumbers(editor.value);
        syncEditorScroll();
    }

    function scheduleHighlight() {
        clearTimeout(highlightTimer);
        highlightTimer = setTimeout(refreshHighlight, 80);
    }

    function syncEditorScroll() {
        const editor = document.getElementById('fmEditor');
        const highlight = document.getElementById('fmHighlight');
        const gutter = document.getElementById('fmGutter');
        if (!editor) return;
        if (highlight) {
            highlight.scrollTop = editor.scrollTop;
            highlight.scrollLeft = editor.scrollLeft;
        }
        if (gutter) gutter.scrollTop = editor.scrollTop;
    }

    function showEditorShell(show) {
        const shell = document.getElementById('fmCodeShell');
        const empty = document.getElementById('fmEditorEmpty');
        if (shell) shell.hidden = !show;
        if (empty) empty.hidden = show;
    }

    function clearEditorView() {
        const editor = document.getElementById('fmEditor');
        const reloadBtn = document.getElementById('fmReloadBtn');
        if (editor) editor.value = '';
        loadedContent = '';
        dirty = false;
        showEditorShell(false);
        if (reloadBtn) reloadBtn.disabled = true;
        const saveBtn = document.getElementById('fmSaveBtn');
        if (saveBtn) saveBtn.disabled = true;
        const status = document.getElementById('fmEditorStatus');
        if (status) {
            status.textContent = '';
            status.classList.remove('is-dirty');
        }
        const codeEl = document.getElementById('fmHighlightCode');
        if (codeEl) codeEl.innerHTML = '';
        const gutter = document.getElementById('fmGutter');
        if (gutter) gutter.innerHTML = '';
        setEditorLocked(true);
    }

    function renderBreadcrumb(filePath) {
        const el = document.getElementById('fmBreadcrumb');
        if (!el) return;

        if (!filePath) {
            el.innerHTML = '<span class="fm-breadcrumb-empty">Select a file to open</span>';
            return;
        }

        const parts = String(filePath).split('/').filter(Boolean);
        let built = '';
        const crumbs = parts.map((part, index) => {
            built = built ? `${built}/${part}` : part;
            const isLast = index === parts.length - 1;
            if (isLast) {
                return `<span class="fm-crumb fm-crumb--current">${escapeHtml(part)}</span>`;
            }
            return `<span class="fm-crumb" data-fm-folder="${escapeHtml(built)}">${escapeHtml(part)}</span><span class="fm-crumb-sep">/</span>`;
        });

        el.innerHTML = `<span class="fm-crumb fm-crumb--root" data-fm-folder="">project</span><span class="fm-crumb-sep">/</span>${crumbs.join('')}`;
    }

    function filterTree(node, query) {
        if (!node) return null;
        const q = query.toLowerCase();

        if (node.type === 'file') {
            const hay = `${node.name} ${node.path}`.toLowerCase();
            return hay.includes(q) ? { ...node } : null;
        }

        const children = (node.children || [])
            .map((child) => filterTree(child, query))
            .filter(Boolean);

        const selfMatch = `${node.name || ''} ${node.path || ''}`.toLowerCase().includes(q);
        if (selfMatch || children.length) {
            return { ...node, children };
        }
        return null;
    }

    function renderTreeNode(node, depth = 0) {
        if (!node) return '';

        const isRoot = !node.path && node.type === 'folder';
        if (isRoot) {
            const kids = (node.children || []).map((c) => renderTreeNode(c, 0)).join('');
            return kids || '<div class="fm-tree-empty">No files found.</div>';
        }

        const isFolder = node.type === 'folder';
        const isOpen = isFolder && (searchQuery ? true : openFolders.has(node.path));
        const isActive = activePath === node.path;
        const iconMeta = fileIconMeta(node.name, node.type);
        const folderIcon = isOpen
            ? { icon: 'fa-solid fa-folder-open', cls: 'fm-icon--folder' }
            : iconMeta;

        const chevron = isFolder
            ? `<button type="button" class="fm-chevron ${isOpen ? 'is-open' : ''}" data-fm-toggle="${escapeHtml(node.path)}" aria-label="Toggle folder">
                    <i class="fa-solid fa-chevron-right"></i>
               </button>`
            : '<span class="fm-chevron-spacer"></span>';

        const sizeHint = !isFolder && node.size != null
            ? `<span class="fm-node-size">${escapeHtml(formatBytes(node.size))}</span>`
            : '';

        let html = `
            <div class="fm-node ${isFolder ? 'fm-node--folder' : 'fm-node--file'} ${isActive ? 'is-active' : ''}"
                 style="--fm-depth:${depth}"
                 role="treeitem"
                 aria-expanded="${isFolder ? (isOpen ? 'true' : 'false') : undefined}"
                 data-fm-path="${escapeHtml(node.path)}"
                 data-fm-type="${escapeHtml(node.type)}">
                ${chevron}
                <span class="fm-node-icon ${folderIcon.cls}"><i class="${folderIcon.icon}"></i></span>
                <span class="fm-node-name" title="${escapeHtml(node.path)}">${escapeHtml(node.name)}</span>
                ${sizeHint}
            </div>
        `;

        if (isFolder && isOpen) {
            html += `<div class="fm-children" role="group">
                ${(node.children || []).map((c) => renderTreeNode(c, depth + 1)).join('') || '<div class="fm-tree-empty fm-tree-empty--nested">Empty folder</div>'}
            </div>`;
        }

        return html;
    }

    function paintTree() {
        const treeEl = document.getElementById('fmTree');
        if (!treeEl || !treeRoot) return;

        const source = searchQuery ? filterTree(treeRoot, searchQuery) : treeRoot;
        if (!source || (!(source.children || []).length && searchQuery)) {
            treeEl.innerHTML = `<div class="fm-tree-empty">No matches for “${escapeHtml(searchQuery)}”.</div>`;
            return;
        }

        treeEl.innerHTML = renderTreeNode(source);
    }

    async function loadTree({ silent = false } = {}) {
        const treeEl = document.getElementById('fmTree');
        if (treeEl && !silent) {
            treeEl.innerHTML = `
                <div class="fm-tree-loading">
                    <div class="spinner"></div>
                    <p>Loading project files…</p>
                </div>`;
        }

        try {
            const result = await fmApi('/api/admin/files');
            treeRoot = result.data || { name: 'project', path: '', type: 'folder', children: [] };
            flatIndex = buildFlatIndex(treeRoot);
            updateStats();
            paintTree();
        } catch (err) {
            if (treeEl) {
                treeEl.innerHTML = `<div class="fm-tree-empty fm-tree-empty--error">${escapeHtml(err.message || 'Failed to load files.')}</div>`;
            }
            if (!silent) notify(err.message || 'Failed to load files.', 'error');
        }
    }

    async function openFile(filePath) {
        if (!filePath) return;

        if (dirty && activePath && activePath !== filePath && activeType === 'file') {
            const proceed = window.confirm('You have unsaved changes. Discard them and open another file?');
            if (!proceed) return;
        }

        const editor = document.getElementById('fmEditor');
        const reloadBtn = document.getElementById('fmReloadBtn');
        const status = document.getElementById('fmEditorStatus');
        if (status) status.textContent = 'Loading…';

        try {
            const result = await fmApi(`/api/admin/files/read?path=${encodeURIComponent(filePath)}`);
            activePath = result.data.path;
            activeType = 'file';
            loadedContent = result.data.content ?? '';

            showEditorShell(true);
            if (editor) {
                editor.value = loadedContent;
            }
            if (reloadBtn) reloadBtn.disabled = false;

            const parts = activePath.split('/');
            let built = '';
            parts.slice(0, -1).forEach((part) => {
                built = built ? `${built}/${part}` : part;
                openFolders.add(built);
            });

            renderBreadcrumb(activePath);
            refreshHighlight();
            setDirty(false);
            // Always re-lock when opening / switching files to prevent accidental edits.
            setEditorLocked(true);
            paintTree();
        } catch (err) {
            notify(err.message || 'Failed to open file.', 'error');
            if (status) status.textContent = '';
        }
    }

    async function saveActiveFile() {
        if (!activePath || activeType !== 'file') return;
        const editor = document.getElementById('fmEditor');
        if (!editor) return;

        const saveBtn = document.getElementById('fmSaveBtn');
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.classList.add('is-busy');
        }

        notify('Saving changes…', 'info');

        try {
            await fmApi('/api/admin/files/save', {
                method: 'POST',
                body: JSON.stringify({ path: activePath, content: editor.value })
            });
            loadedContent = editor.value;
            setDirty(false);
            setEditorLocked(true);
            notify('Changes saved successfully.', 'success');
            await loadTree({ silent: true });
        } catch (err) {
            notify(err.message || 'Failed to save file.', 'error');
            setDirty(true);
        } finally {
            if (saveBtn) saveBtn.classList.remove('is-busy');
        }
    }

    /* ======================================================================
       CREATE / DELETE MODALS
       ====================================================================== */

    function openCreateModal(type) {
        const modal = document.getElementById('fmCreateModal');
        const title = document.getElementById('fmCreateModalTitle');
        const typeInput = document.getElementById('fmCreateType');
        const nameInput = document.getElementById('fmCreateName');
        const parentInput = document.getElementById('fmCreateParent');
        if (!modal) return;

        typeInput.value = type;
        title.textContent = type === 'folder' ? 'New Folder' : 'New File';
        nameInput.value = '';
        nameInput.placeholder = type === 'folder' ? 'e.g. utils' : 'e.g. helper.js';

        let parent = '';
        if (activePath) {
            if (activeType === 'folder') parent = activePath;
            else {
                const parts = activePath.split('/');
                parts.pop();
                parent = parts.join('/');
            }
        }
        parentInput.value = parent;

        modal.style.display = 'flex';
        setTimeout(() => nameInput.focus(), 30);
    }

    function closeCreateModal() {
        const modal = document.getElementById('fmCreateModal');
        if (modal) modal.style.display = 'none';
    }

    async function createEntry(event) {
        event.preventDefault();
        const type = document.getElementById('fmCreateType').value || 'file';
        const name = document.getElementById('fmCreateName').value.trim();
        const parent = document.getElementById('fmCreateParent').value.trim().replace(/\\/g, '/');

        if (!name) {
            notify('Name is required.', 'warning');
            return;
        }
        if (name.includes('/') || name.includes('\\') || name.includes('..')) {
            notify('Name cannot contain path separators or "..".', 'warning');
            return;
        }

        const targetPath = joinPath(parent, name);
        const submitBtn = document.getElementById('fmCreateSubmit');
        if (submitBtn) submitBtn.disabled = true;

        try {
            await fmApi('/api/admin/files/create', {
                method: 'POST',
                body: JSON.stringify({
                    path: targetPath,
                    type,
                    content: type === 'file' ? '' : undefined
                })
            });
            notify(type === 'folder' ? 'Folder created.' : 'File created.', 'success');
            closeCreateModal();

            if (parent) openFolders.add(parent);
            await loadTree({ silent: true });

            if (type === 'file') {
                await openFile(targetPath);
            } else {
                openFolders.add(targetPath);
                activePath = targetPath;
                activeType = 'folder';
                renderBreadcrumb(activePath);
                updateDeleteButton();
                paintTree();
            }
        } catch (err) {
            notify(err.message || 'Failed to create.', 'error');
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    function openDeleteModal() {
        if (!activePath) {
            notify('Select a file or folder to delete.', 'warning');
            return;
        }

        deleteTargetPath = activePath;
        deleteTargetType = activeType || 'file';

        const modal = document.getElementById('fmDeleteModal');
        const nameEl = document.getElementById('fmDeleteFileName');
        const passwordInput = document.getElementById('fmDeletePassword');
        const errorEl = document.getElementById('fmDeleteError');
        const label = basename(deleteTargetPath) || deleteTargetPath;

        if (nameEl) nameEl.textContent = label;
        if (passwordInput) {
            passwordInput.value = '';
            passwordInput.type = 'password';
        }
        const toggle = document.getElementById('fmDeletePasswordToggle');
        if (toggle) {
            toggle.innerHTML = '<i class="fa-solid fa-eye"></i>';
            toggle.title = 'Show password';
        }
        if (errorEl) {
            errorEl.hidden = true;
            errorEl.textContent = '';
        }
        if (modal) modal.style.display = 'flex';
        setTimeout(() => passwordInput && passwordInput.focus(), 40);
    }

    function closeDeleteModal() {
        const modal = document.getElementById('fmDeleteModal');
        if (modal) modal.style.display = 'none';
        deleteTargetPath = null;
        deleteTargetType = null;
        const passwordInput = document.getElementById('fmDeletePassword');
        if (passwordInput) passwordInput.value = '';
        const errorEl = document.getElementById('fmDeleteError');
        if (errorEl) {
            errorEl.hidden = true;
            errorEl.textContent = '';
        }
    }

    async function confirmDelete(event) {
        event.preventDefault();

        const passwordInput = document.getElementById('fmDeletePassword');
        const errorEl = document.getElementById('fmDeleteError');
        const confirmBtn = document.getElementById('fmDeleteConfirmBtn');
        const adminPassword = passwordInput ? passwordInput.value : '';

        if (!deleteTargetPath) {
            closeDeleteModal();
            return;
        }

        if (!adminPassword) {
            if (errorEl) {
                errorEl.hidden = false;
                errorEl.textContent = 'Super Admin password is required.';
            }
            passwordInput?.focus();
            return;
        }

        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.classList.add('is-busy');
        }
        if (errorEl) {
            errorEl.hidden = true;
            errorEl.textContent = '';
        }

        try {
            await fmApi('/api/admin/files/delete', {
                method: 'DELETE',
                body: JSON.stringify({
                    path: deleteTargetPath,
                    adminPassword
                })
            });

            const removedPath = deleteTargetPath;
            const removedType = deleteTargetType;
            closeDeleteModal();
            notify(`${removedType === 'folder' ? 'Folder' : 'File'} deleted permanently.`, 'success');

            if (activePath === removedPath || (activePath && activePath.startsWith(`${removedPath}/`))) {
                activePath = null;
                activeType = null;
                clearEditorView();
                renderBreadcrumb('');
            }

            await loadTree({ silent: true });
            updateDeleteButton();
        } catch (err) {
            if (errorEl) {
                errorEl.hidden = false;
                errorEl.textContent = err.message || 'Delete failed.';
            }
            notify(err.message || 'Delete failed.', 'error');
            if (passwordInput) {
                passwordInput.value = '';
                passwordInput.focus();
            }
        } finally {
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.classList.remove('is-busy');
            }
        }
    }

    function onTreeClick(event) {
        const toggle = event.target.closest('[data-fm-toggle]');
        if (toggle) {
            event.preventDefault();
            event.stopPropagation();
            const path = toggle.getAttribute('data-fm-toggle');
            if (openFolders.has(path)) openFolders.delete(path);
            else openFolders.add(path);
            paintTree();
            return;
        }

        const node = event.target.closest('.fm-node');
        if (!node) return;

        const path = node.getAttribute('data-fm-path');
        const type = node.getAttribute('data-fm-type');

        if (type === 'folder') {
            if (openFolders.has(path)) openFolders.delete(path);
            else openFolders.add(path);
            activePath = path;
            activeType = 'folder';
            renderBreadcrumb(activePath);
            updateDeleteButton();
            // Leaving a file context — re-lock so Edit File cannot stay armed on a folder.
            setEditorLocked(true);
            paintTree();
            return;
        }

        openFile(path);
    }

    function onSearchInput(event) {
        const value = event.target.value;
        const clearBtn = document.getElementById('fmSearchClear');
        if (clearBtn) clearBtn.hidden = !value;

        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            searchQuery = value.trim();
            paintTree();
        }, 120);
    }

    function bindUi() {
        if (uiBound) return;
        uiBound = true;

        const tree = document.getElementById('fmTree');
        const search = document.getElementById('fmSearchInput');
        const clearBtn = document.getElementById('fmSearchClear');
        const editor = document.getElementById('fmEditor');
        const saveBtn = document.getElementById('fmSaveBtn');
        const reloadBtn = document.getElementById('fmReloadBtn');
        const editToggleBtn = document.getElementById('fmEditToggleBtn');
        const deleteBtn = document.getElementById('fmDeleteBtn');
        const refreshBtn = document.getElementById('fmRefreshBtn');
        const newFileBtn = document.getElementById('fmNewFileBtn');
        const newFolderBtn = document.getElementById('fmNewFolderBtn');
        const createForm = document.getElementById('fmCreateForm');
        const deleteForm = document.getElementById('fmDeleteForm');
        const breadcrumb = document.getElementById('fmBreadcrumb');
        const createModal = document.getElementById('fmCreateModal');
        const deleteModal = document.getElementById('fmDeleteModal');
        const passwordToggle = document.getElementById('fmDeletePasswordToggle');

        if (tree) tree.addEventListener('click', onTreeClick);
        if (search) search.addEventListener('input', onSearchInput);
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                search.value = '';
                clearBtn.hidden = true;
                searchQuery = '';
                paintTree();
                search.focus();
            });
        }
        if (editor) {
            editor.readOnly = true;
            editor.classList.add('is-readonly');
            editor.addEventListener('input', () => {
                if (editor.readOnly || editorLocked) return;
                setDirty(editor.value !== loadedContent);
                scheduleHighlight();
            });
            editor.addEventListener('scroll', syncEditorScroll);
            editor.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                    e.preventDefault();
                    if (!saveBtn?.disabled) saveActiveFile();
                    return;
                }
                // Keep tabs inside the editor instead of leaving the field (edit mode only).
                if (e.key === 'Tab') {
                    if (editor.readOnly || editorLocked) return;
                    e.preventDefault();
                    const start = editor.selectionStart;
                    const end = editor.selectionEnd;
                    const value = editor.value;
                    editor.value = `${value.slice(0, start)}  ${value.slice(end)}`;
                    editor.selectionStart = editor.selectionEnd = start + 2;
                    setDirty(editor.value !== loadedContent);
                    scheduleHighlight();
                }
            });
        }
        if (editToggleBtn) {
            editToggleBtn.addEventListener('click', () => {
                if (!(activePath && activeType === 'file')) return;
                const nextLocked = !editorLocked;
                setEditorLocked(nextLocked);
                if (!nextLocked) {
                    const ed = document.getElementById('fmEditor');
                    if (ed) ed.focus({ preventScroll: true });
                }
            });
        }
        if (saveBtn) saveBtn.addEventListener('click', saveActiveFile);
        if (reloadBtn) {
            reloadBtn.addEventListener('click', () => {
                if (activePath && activeType === 'file') openFile(activePath);
            });
        }
        if (deleteBtn) deleteBtn.addEventListener('click', openDeleteModal);
        if (refreshBtn) refreshBtn.addEventListener('click', () => loadTree());
        if (newFileBtn) newFileBtn.addEventListener('click', () => openCreateModal('file'));
        if (newFolderBtn) newFolderBtn.addEventListener('click', () => openCreateModal('folder'));
        if (createForm) createForm.addEventListener('submit', createEntry);
        if (deleteForm) deleteForm.addEventListener('submit', confirmDelete);
        if (createModal) {
            createModal.addEventListener('click', (e) => {
                if (e.target.closest('[data-fm-close]')) closeCreateModal();
            });
        }
        if (deleteModal) {
            deleteModal.addEventListener('click', (e) => {
                if (e.target.closest('[data-fm-delete-close]')) closeDeleteModal();
            });
        }
        if (passwordToggle) {
            passwordToggle.addEventListener('click', () => {
                const input = document.getElementById('fmDeletePassword');
                if (!input) return;
                const show = input.type === 'password';
                input.type = show ? 'text' : 'password';
                passwordToggle.innerHTML = show
                    ? '<i class="fa-solid fa-eye-slash"></i>'
                    : '<i class="fa-solid fa-eye"></i>';
                passwordToggle.title = show ? 'Hide password' : 'Show password';
            });
        }
        if (breadcrumb) {
            breadcrumb.addEventListener('click', (e) => {
                const crumb = e.target.closest('[data-fm-folder]');
                if (!crumb) return;
                const folderPath = crumb.getAttribute('data-fm-folder');
                if (folderPath) openFolders.add(folderPath);
                paintTree();
            });
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const deleteOpen = document.getElementById('fmDeleteModal');
                if (deleteOpen && deleteOpen.style.display === 'flex') {
                    closeDeleteModal();
                    return;
                }
                const createOpen = document.getElementById('fmCreateModal');
                if (createOpen && createOpen.style.display === 'flex') closeCreateModal();
            }
        });
    }

    async function loadFileManagerSection() {
        bindUi();
        await loadTree();
    }

    window.loadFileManagerSection = loadFileManagerSection;
})();





