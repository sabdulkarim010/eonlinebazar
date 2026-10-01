/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/products-ai.js
 * Description: AI product assist modal — vision uploads, multilingual, form apply.
 */
/* Dependencies: aiGeneratedData, productHighlights, showToast, closeModal, applyAiProductPayload, token (window) */
/* Exposes: window.applyAIContent, window.closeModal, window.generateAIContent, window.openAIAssist */

import '../admin-core.js';

/* shared state: aiGeneratedData lives on window (admin-core) */

let aiVisionFileList = new DataTransfer();
let aiVisionDropzoneBound = false;

function getAiAuthToken() {
    return window.EOBStorage?.get(window.EOBStorageKeys?.ADMIN_TOKEN) || token || '';
}

function renderAiVisionPreviews() {
    const grid = document.getElementById('aiVisionPreviewGrid');
    if (!grid) return;

    grid.innerHTML = '';
    const files = aiVisionFileList.files;
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const wrap = document.createElement('div');
        wrap.className = 'ai-vision-thumb';
        const img = document.createElement('img');
        img.alt = file.name;
        img.src = URL.createObjectURL(file);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ai-vision-thumb-remove';
        btn.setAttribute('aria-label', 'Remove image');
        btn.textContent = '×';
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            removeAiVisionImage(i);
        });
        wrap.appendChild(img);
        wrap.appendChild(btn);
        grid.appendChild(wrap);
    }
}

function syncAiVisionInputElement() {
    const input = document.getElementById('aiVisionFileInput');
    if (input) input.files = aiVisionFileList.files;
}

function addAiVisionFiles(fileList) {
    const max = 5;
    for (let i = 0; i < fileList.length; i++) {
        if (aiVisionFileList.files.length >= max) break;
        const file = fileList[i];
        if (!String(file.type || '').startsWith('image/')) continue;
        aiVisionFileList.items.add(file);
    }
    syncAiVisionInputElement();
    renderAiVisionPreviews();
}

function removeAiVisionImage(index) {
    const next = new DataTransfer();
    const files = aiVisionFileList.files;
    for (let i = 0; i < files.length; i++) {
        if (i !== index) next.items.add(files[i]);
    }
    aiVisionFileList = next;
    syncAiVisionInputElement();
    renderAiVisionPreviews();
}

function resetAiVisionUploads() {
    aiVisionFileList = new DataTransfer();
    syncAiVisionInputElement();
    renderAiVisionPreviews();
}

function bindAiVisionDropzone() {
    if (aiVisionDropzoneBound) return;
    const zone = document.getElementById('aiVisionDropzone');
    const input = document.getElementById('aiVisionFileInput');
    if (!zone || !input) return;

    aiVisionDropzoneBound = true;

    input.addEventListener('change', () => {
        if (input.files?.length) addAiVisionFiles(input.files);
    });

    ['dragenter', 'dragover'].forEach((ev) => {
        zone.addEventListener(ev, (e) => {
            e.preventDefault();
            zone.classList.add('ai-vision-dropzone--active');
        });
    });

    ['dragleave', 'drop'].forEach((ev) => {
        zone.addEventListener(ev, (e) => {
            e.preventDefault();
            zone.classList.remove('ai-vision-dropzone--active');
        });
    });

    zone.addEventListener('drop', (e) => {
        if (e.dataTransfer?.files?.length) {
            addAiVisionFiles(e.dataTransfer.files);
        }
    });
}

function formatAiPreviewHtml(data) {
    const highlights = (data.keyHighlights || data.highlights || []).join(', ') || '—';
    return (
        '<b>Name:</b> ' + (data.name || '—') + '<br><br>' +
        '<b>Short Desc:</b> ' + (data.shortDescription || '—') + '<br><br>' +
        '<b>Highlights:</b> ' + highlights + '<br><br>' +
        '<b>Category:</b> ' + (data.suggestedCategory || '—') + '<br>' +
        '<b>SEO Title:</b> ' + (data.seoTitle || '—') + '<br>' +
        '<b>SEO Description:</b> ' + (data.seoDescription || '—')
    );
}

window.closeModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('open');
};

window.openAIAssist = function() {
    bindAiVisionDropzone();

    const productName = document.getElementById('prodName')?.value || '';
    const nameInput = document.getElementById('ai-product-name');
    if (nameInput && productName) nameInput.value = productName;

    document.getElementById('ai-loading').style.display = 'none';
    document.getElementById('ai-result').style.display = 'none';
    document.getElementById('ai-error').style.display = 'none';
    document.getElementById('ai-apply-btn').style.display = 'none';
    document.getElementById('ai-generate-btn').style.display = 'inline-flex';
    document.getElementById('ai-generate-btn').textContent = '✨ Generate';
    aiGeneratedData = null;
    resetAiVisionUploads();

    document.getElementById('ai-assist-modal').classList.add('open');
};

window.generateAIContent = async function() {
    const productName = document.getElementById('ai-product-name')?.value?.trim();
    const context = document.getElementById('ai-additional-context')?.value?.trim();
    const contentLanguage = document.getElementById('ai-content-language')?.value || 'english';
    const nameLanguage = document.getElementById('ai-name-language')?.value || 'english';
    const visionCount = aiVisionFileList.files.length;

    if ((!productName || productName.length < 2) && visionCount === 0) {
        document.getElementById('ai-error').style.display = 'block';
        document.getElementById('ai-error').textContent =
            'Enter a product name (2+ characters) or upload at least one photo for AI vision.';
        return;
    }

    document.getElementById('ai-loading').style.display = 'block';
    document.getElementById('ai-result').style.display = 'none';
    document.getElementById('ai-error').style.display = 'none';
    document.getElementById('ai-generate-btn').disabled = true;

    try {
        const formData = new FormData();
        if (productName) formData.append('productName', productName);
        if (context) formData.append('additionalContext', context);
        formData.append('contentLanguage', contentLanguage);
        formData.append('nameLanguage', nameLanguage);

        for (let i = 0; i < aiVisionFileList.files.length; i++) {
            formData.append('aiImages', aiVisionFileList.files[i]);
        }

        const res = await fetch('/api/admin/ai/product-assist', {
            method: 'POST',
            headers: {
                Authorization: 'Bearer ' + getAiAuthToken()
            },
            body: formData
        });

        const data = await res.json();

        if (data.success && data.data) {
            aiGeneratedData = data.data;

            const preview = document.getElementById('ai-preview-text');
            if (preview) preview.innerHTML = formatAiPreviewHtml(data.data);

            document.getElementById('ai-result').style.display = 'block';
            document.getElementById('ai-apply-btn').style.display = 'inline-flex';
            document.getElementById('ai-generate-btn').textContent = '🔄 Regenerate';
        } else {
            throw new Error(data.message || 'AI failed');
        }
    } catch (err) {
        document.getElementById('ai-error').style.display = 'block';
        document.getElementById('ai-error').textContent =
            'AI assist failed: ' + err.message +
            '. Ensure ANTHROPIC_API_KEY is set in .env';
    } finally {
        document.getElementById('ai-loading').style.display = 'none';
        document.getElementById('ai-generate-btn').disabled = false;
    }
};

window.applyAIContent = function() {
    if (!aiGeneratedData) return;

    if (typeof window.applyAiProductPayload === 'function') {
        window.applyAiProductPayload(aiGeneratedData);
    }

    showToast('✨ AI content applied to form!', 'success');
    closeModal('ai-assist-modal');
};

document.addEventListener('DOMContentLoaded', () => {
    bindAiVisionDropzone();
});
