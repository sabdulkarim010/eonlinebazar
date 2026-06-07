/* ==================================================
   WHATSAPP TOOLTIP LOGIC
================================================== */
document.addEventListener("DOMContentLoaded", function() {
    const tooltip = document.getElementById("waTooltip");
    
    // পেজ লোড হওয়ার ৩ সেকেন্ড পর মেসেজটি ভেসে উঠবে
    setTimeout(() => {
        if (tooltip) {
            tooltip.classList.add("show");
        }
    }, 3000);

    // ১০ সেকেন্ড পর মেসেজটি আবার একা একাই লুকিয়ে যাবে
    setTimeout(() => {
        if (tooltip) {
            tooltip.classList.remove("show");
        }
    }, 10000);
});






