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
        }, 50);
    } catch (error) {
        console.error('eOnlineBazar Footer Engine Error:', error);
        if (innerContainer && buildHtml) {
            innerContainer.innerHTML = buildHtml({
                copyrightText: '© 2026 EonlineBazar. All rights reserved. Designed by Abdul Karim Sheikh',
                columns: [{
                    columnTitle: 'COMPANY',
                    links: [
                        { label: 'About Us', url: '/about', isActive: true },
                        { label: 'Contact Us', url: '/contact', isActive: true }
                    ]
                }]
            });
        }
        footerContainer.style.opacity = '1';
    }
}

window.initGlobalFooterEngine = initGlobalFooterEngine;
