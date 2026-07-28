/**
 * Contact page — form submission + dynamic store info panel.
 */

document.addEventListener('DOMContentLoaded', () => {
    checkContactPageAccess();
    setupContactForm();
});

async function checkContactPageAccess() {
    try {
        const res = await fetch('/api/store/pages/contact');
        if (res.ok) {
            loadContactStoreInfo();
            return;
        }
    } catch (_) { /* fall through */ }

    const wrap = document.querySelector('.contact-page-wrap');
    if (wrap) {
        wrap.innerHTML = `
            <div class="contact-page-header">
                <h1>Contact Unavailable</h1>
                <p>This page is not published. Please check back later or email support@eonlinebazar.com.</p>
            </div>`;
    }
    document.getElementById('contactForm')?.closest('.contact-form-panel')?.remove();
}

function setupContactForm() {
    const form = document.getElementById('contactForm');
    if (!form) return;

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const name = document.getElementById('contactName')?.value?.trim() || '';
        const email = document.getElementById('contactEmail')?.value?.trim() || '';
        const phone = document.getElementById('contactPhone')?.value?.trim() || '';
        const subject = document.getElementById('contactSubject')?.value?.trim() || '';
        const message = document.getElementById('contactMessage')?.value?.trim() || '';
        const submitBtn = document.getElementById('contactSubmitBtn');

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (name.length < 2) {
            showToast('Please enter your name (at least 2 characters).', 'warning');
            return;
        }
        if (!emailRegex.test(email)) {
            showToast('Please enter a valid email address.', 'warning');
            return;
        }
        if (message.length < 10) {
            showToast('Your message must be at least 10 characters.', 'warning');
            return;
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';
        }

        try {
            const res = await fetch('/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, phone, subject, message })
            });
            const result = await res.json();

            if (!result.success) {
                throw new Error(result.message || 'Failed to send message.');
            }

            showToast(result.message || 'Message sent successfully!', 'success');
            form.reset();
        } catch (err) {
            console.error('Contact form error:', err);
            showToast(err.message || 'Could not send message. Please try again.', 'error');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Message';
            }
        }
    });
}

async function loadContactStoreInfo() {
    const panel = document.getElementById('contact-info-panel');
    if (!panel) return;

    try {
        const res = await fetch('/api/store/pages/contact');
        const result = await res.json();

        if (!result.success || !result.data) {
            panel.innerHTML = '<p class="contact-loading">Store information is unavailable.</p>';
            return;
        }

        const meta = result.data.contactMeta || {};
        const hoursHtml = String(meta.hours || '')
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => `<span>${escapeHtml(line)}</span>`)
            .join('<br>');

        panel.innerHTML = `
            <div class="contact-info-card">
                <i class="fa-solid fa-location-dot"></i>
                <div>
                    <h4>Store Address</h4>
                    <p>${escapeHtml(meta.address || 'Address not set')}</p>
                </div>
            </div>
            <div class="contact-info-card">
                <i class="fa-solid fa-phone"></i>
                <div>
                    <h4>Phone</h4>
                    <p><a href="tel:${escapeHtml(meta.phone || '')}">${escapeHtml(meta.phone || 'Not available')}</a></p>
                </div>
            </div>
            <div class="contact-info-card">
                <i class="fa-solid fa-envelope"></i>
                <div>
                    <h4>Support Email</h4>
                    <p><a href="mailto:${escapeHtml(meta.email || '')}">${escapeHtml(meta.email || 'Not available')}</a></p>
                </div>
            </div>
            <div class="contact-info-card">
                <i class="fa-solid fa-clock"></i>
                <div>
                    <h4>Operating Hours</h4>
                    <p>${hoursHtml || 'Not available'}</p>
                </div>
            </div>
            ${meta.mapEmbedUrl ? `
            <div class="contact-map-wrap">
                <iframe src="${escapeHtml(meta.mapEmbedUrl)}" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Store location map"></iframe>
            </div>` : ''}`;
    } catch (err) {
        console.error('Contact info load error:', err);
        panel.innerHTML = '<p class="contact-loading">Could not load store information.</p>';
    }
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
