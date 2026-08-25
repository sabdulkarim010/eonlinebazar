/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/products-ai.js
 * Description: AI product description assist modal.
 */
/* Dependencies: aiGeneratedData, productHighlights, showToast, closeModal, updateSeoPreview, updatePricePreview (window) */
/* Exposes: window.applyAIContent, window.closeModal, window.generateAIContent, window.openAIAssist */

import '../admin-core.js';

/* shared state: aiGeneratedData lives on window (admin-core) */

window.closeModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('open');
};

window.openAIAssist = function() {
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

    document.getElementById('ai-assist-modal').classList.add('open');
};

window.generateAIContent = async function() {
    const productName = document.getElementById('ai-product-name')?.value?.trim();
    const context = document.getElementById('ai-additional-context')?.value?.trim();

    if (!productName) {
        document.getElementById('ai-error').style.display = 'block';
        document.getElementById('ai-error').textContent = 'Please enter a product name';
        return;
    }

    document.getElementById('ai-loading').style.display = 'block';
    document.getElementById('ai-result').style.display = 'none';
    document.getElementById('ai-error').style.display = 'none';
    document.getElementById('ai-generate-btn').disabled = true;

    try {
        const res = await fetch('/api/admin/ai/product-assist', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({
                productName,
                additionalContext: context
            })
        });

        const data = await res.json();

        if (data.success && data.data) {
            aiGeneratedData = data.data;

            const preview = document.getElementById('ai-preview-text');
            if (preview) {
                preview.innerHTML =
                    '<b>Short Desc:</b> ' + (data.data.shortDescription || '—') + '<br><br>' +
                    '<b>Highlights:</b> ' + (data.data.highlights || []).join(', ') + '<br><br>' +
                    '<b>Category:</b> ' + (data.data.suggestedCategory || '—') + '<br>' +
                    '<b>Price Range:</b> ৳' + (data.data.suggestedPriceRange?.min || 0) +
                    ' – ৳' + (data.data.suggestedPriceRange?.max || 0);
            }

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
            '. Make sure ANTHROPIC_API_KEY is set in .env';
    } finally {
        document.getElementById('ai-loading').style.display = 'none';
        document.getElementById('ai-generate-btn').disabled = false;
    }
};

window.applyAIContent = function() {
    if (!aiGeneratedData) return;

    const d = aiGeneratedData;

    const shortDesc = document.getElementById('prodDesc');
    if (shortDesc && d.shortDescription) shortDesc.value = d.shortDescription;

    const detailedDesc = document.getElementById('prodDetailedDesc');
    if (detailedDesc && d.detailedDescription) detailedDesc.value = d.detailedDescription;

    if (d.highlights && d.highlights.length) {
        productHighlights = d.highlights;
        renderHighlightTags();
        const hidden = document.getElementById('prodHighlights');
        if (hidden) hidden.value = productHighlights.join(',');
    }

    if (d.suggestedCategory) {
        const categorySelect = document.getElementById('prodCategory');
        if (categorySelect) {
            const match = Array.from(categorySelect.options).find(
                opt => opt.textContent.trim().toLowerCase() === d.suggestedCategory.trim().toLowerCase()
                    || opt.value.trim().toLowerCase() === d.suggestedCategory.trim().toLowerCase()
            );
            if (match) categorySelect.value = match.value;
        }
    }

    const priceInput = document.getElementById('prodPrice');
    if (priceInput && !priceInput.value && d.suggestedPriceRange?.min) {
        priceInput.value = d.suggestedPriceRange.min;
    }

    updateSeoPreview();
    updatePricePreview();

    showToast('✨ AI content applied to form!', 'success');
    closeModal('ai-assist-modal');
};

