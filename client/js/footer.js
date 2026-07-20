/**
 * Project: eOnlineBazar
 * Author: Abdul Karim Sheikh
 * File: js/footer.js
 * Description: Dedicated Global Footer Injection Engine
 */

async function initGlobalFooterEngine() {
    const footerContainer = document.getElementById('global-site-footer');
    if (!footerContainer) return;

    // লোডিং প্লেসহোল্ডার
    footerContainer.innerHTML = `
        <div style="text-align: center; padding: 30px; color: #94a3b8; font-family: sans-serif;">
            <i class="fa-solid fa-spinner fa-spin" style="margin-right: 8px;"></i> Loading Footer...
        </div>
    `;

    try {
        const response = await fetch('/footer');
        if (!response.ok) throw new Error(`HTTP Error! Status: ${response.status}`);

        const htmlContent = await response.text();
        
        footerContainer.style.opacity = '0';
        footerContainer.style.transition = 'opacity 0.3s ease-in-out';
        footerContainer.innerHTML = htmlContent;

        if (typeof window.refreshStoreBranding === 'function') {
            window.refreshStoreBranding();
        }
        
        setTimeout(() => {
            footerContainer.style.opacity = '1';
        }, 50);

    } catch (error) {
        console.error("eOnlineBazar Footer Engine Error:", error);
        // ফলব্যাক ব্যাকআপ
        footerContainer.innerHTML = `
            <div style="background: #1e293b; color: #f8fafc; text-align: center; padding: 20px; font-size: 14px; font-family: sans-serif; border-top: 1px solid #334155;">
                <p>&copy; 2026 <strong>eOnlineBazar</strong>. All Rights Reserved. Designed by <strong>Abdul Karim Sheikh</strong></p>
            </div>
        `;
    }
}

// ফাংশনটি গ্লোবালি এক্সপোর্ট করে দেওয়া হলো যাতে অন্য ফাইল থেকে কল করা যায়
window.initGlobalFooterEngine = initGlobalFooterEngine;





