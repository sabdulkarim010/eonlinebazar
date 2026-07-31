/**
 * Project: eOnlineBazar
 * File: js/footer.js
 * Description: Dynamic Global Footer — renders from /api/store/footer-settings
 */

async function initGlobalFooterEngine() {
    const footerContainer = document.getElementById('global-site-footer');
    if (!footerContainer) return;

    const buildHtml = window.FooterRenderer?.buildFooterHtml;
    const buildShell = window.FooterRenderer?.buildFooterShell;

    footerContainer.innerHTML = buildShell
        ? buildShell('<p class="footer-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading Footer...</p>')
        : '<p class="footer-loading">Loading Footer...</p>';

    const innerContainer = footerContainer.querySelector('.footer-container');

    try {
        const response = await fetch('/api/store/footer-settings');
        if (!response.ok) throw new Error(`HTTP Error! Status: ${response.status}`);

        const result = await response.json();
        if (!result.success || !result.data) throw new Error(result.message || 'Invalid footer payload');

        footerContainer.style.opacity = '0';
        footerContainer.style.transition = 'opacity 0.3s ease-in-out';

        if (buildHtml && innerContainer) {
            innerContainer.innerHTML = buildHtml(result.data);
        } else if (buildShell) {
            footerContainer.innerHTML = buildShell('');
        }

        setTimeout(() => {
            footerContainer.style.opacity = '1';
            if (window.i18n?.applyTranslations) window.i18n.applyTranslations();
        }, 50);
    } catch (error) {
        console.error('eOnlineBazar Footer Engine Error:', error);
        if (innerContainer && buildHtml) {
            innerContainer.innerHTML = buildHtml({
                copyrightText: '© 2026 EonlineBazar. All rights reserved. Designed by Abdul Karim Sheikh',
                columns: [
                    {
                        columnTitle: 'Company',
                        links: [
                            { label: 'About Us', url: '/about', isActive: true },
                            { label: 'Contact Us', url: '/contact', isActive: true },
                            { label: 'Careers', url: '/careers', isActive: true },
                            { label: 'Privacy Policy', url: '/privacy-policy', isActive: true }
                        ]
                    },
                    {
                        columnTitle: 'Support',
                        links: [
                            { label: 'Your Account', url: '/login', isActive: true },
                            { label: 'Help Center', url: '#', isActive: true },
                            { label: 'Track Order', url: '/order-track', isActive: true },
                            { label: 'Return Policy', url: '#', isActive: true }
                        ]
                    }
                ],
                socialLinks: [
                    { platform: 'Facebook', iconName: 'facebook', linkUrl: 'https://facebook.com/', isActive: true },
                    { platform: 'Instagram', iconName: 'instagram', linkUrl: 'https://instagram.com/', isActive: true },
                    { platform: 'TikTok', iconName: 'tiktok', linkUrl: 'https://tiktok.com/', isActive: true }
                ]
            });
        }
        footerContainer.style.opacity = '1';
    }
}

window.initGlobalFooterEngine = initGlobalFooterEngine;

async function subscribeNewsletter(inputId = 'newsletter-email') {
    const emailInput = document.getElementById(inputId);
    if (!emailInput) return;

    const email = emailInput.value.trim();
    if (!email) return;

    const msgId = inputId === 'newsletter-email-mobile' ? 'newsletter-msg-mobile' : 'newsletter-msg';
    const msg = document.getElementById(msgId);

    try {
        const res = await fetch('/api/newsletter/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, source: 'footer_form' })
        });
        const data = await res.json();
        if (msg) {
            msg.textContent = data.message;
            msg.style.color = data.success ? '#4ade80' : '#f87171';
            msg.style.display = 'block';
        }
        if (data.success) emailInput.value = '';
    } catch (err) {
        console.error(err);
        if (msg) {
            msg.textContent = 'Something went wrong';
            msg.style.color = '#f87171';
            msg.style.display = 'block';
        }
    }
}

window.subscribeNewsletter = subscribeNewsletter;
