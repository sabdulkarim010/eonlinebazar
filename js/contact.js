/**
 * Project: eOnlineBazar
 * Author: Abdul Karim Sheikh
 * Description: Contact Page Form Validation and Submission Logic.
 * All alerts and UI response text are in professional English.
 */

// --- ১. পেজ লোড হওয়ার সাথে সাথে কন্টাক্ট ফর্মের ইভেন্ট সেটআপ করা ---
document.addEventListener('DOMContentLoaded', () => {
    setupContactForm();
});

/**
 * --- ২. কন্টাক্ট ফর্ম ভ্যালিডেশন এবং মেসেজ সাবমিশন ---
 */
function setupContactForm() {
    const contactForm = document.getElementById('contactForm');
    if (!contactForm) return;

    // এইচটিএমএল ফাইলে যদি কোনো ইনলাইন onsubmit থাকে তা রিমুভ করা
    contactForm.removeAttribute('onsubmit');

    contactForm.addEventListener('submit', (event) => {
        event.preventDefault(); // ফর্ম সাবমিট হলে পেজ রিলোড হওয়া বন্ধ করা

        // ইনপুট ফিল্ডগুলোর ভ্যালু নেওয়া
        const clientName = document.getElementById('contactName').value.trim();
        const clientEmail = document.getElementById('contactEmail').value.trim();
        const clientMessage = document.getElementById('contactMessage').value.trim();

        // স্ট্যান্ডার্ড ইমেইল ভ্যালিডেশন রিজেক্স (Regex)
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        // ১. নাম চেক (মিনিমাম ৩ ক্যারেক্টার হতে হবে)
        if (clientName.length < 3) {
            alert("Please enter a valid name (at least 3 characters long).");
            return;
        }

        // ২. ইমেইল ফরম্যাট চেক
        if (!emailRegex.test(clientEmail)) {
            alert("Please enter a valid email address (e.g., john@example.com).");
            return;
        }

        // ৩. মেসেজ বক্স চেক (একেবারে ছোট মেসেজ যেন না পাঠাতে পারে)
        if (clientMessage.length < 10) {
            alert("Your message is too short. Please clarify your question (at least 10 characters).");
            return;
        }

        // --- ৩. সফলভাবে মেসেজ সাবমিট হওয়ার রেসপন্স ---
        alert(`Thank you, ${clientName}! Your message has been sent successfully. Our support team will respond to ${clientEmail} soon.`);
        
        // মেসেজ পাঠানো শেষে ফর্মটি একদম রিসেট (খালি) করে দেওয়া
        contactForm.reset();
    });
}