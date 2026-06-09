/**
 * File Name: profile.js
 * Location: client/js/profile.js
 * Description: Advanced Frontend Controller for EonlineBazar User Dashboard
 * Features: Auto-fill Checkout Data, Password Toggle, Avatar Upload with Preview, Live Orders, Review Modal
 * Developer: Abdul Karim
 */

document.addEventListener('DOMContentLoaded', () => {
    // =================================================================
    // ১. গ্লোবাল ভেরিয়েবল এবং টোকেন ভেরিফিকেশন (Initialization)
    // =================================================================
    const token = localStorage.getItem('token') || localStorage.getItem('customerToken');
    
    // ইউজার লগইন না থাকলে হোম পেজ বা লগইন পেজে রিডাইরেক্ট করবে
    if (!token) {
        showToast('Access denied. Please login first!', 'danger');
        setTimeout(() => window.location.href = '/login.html', 2000);
        return;
    }

    // DOM ইলিমেন্টসমূহ সিলেক্ট করা
    const sidebarName = document.getElementById('sidebar-name');
    const sidebarEmail = document.getElementById('sidebar-email');
    const sidebarAvatar = document.getElementById('sidebar-avatar');
    const avatarInput = document.getElementById('avatar-input');
    
    const profileForm = document.getElementById('profile-form');
    const profileName = document.getElementById('profile-name');
    const profileEmail = document.getElementById('profile-email');
    const profilePhone = document.getElementById('profile-phone');
    const profileAddress = document.getElementById('profile-address');
    
    const passwordForm = document.getElementById('password-form');
    const ordersListTbody = document.getElementById('orders-list-tbody');
    const logoutBtn = document.getElementById('logout-btn');

    // =================================================================
    // ২. টোস্ট নোটিফিকেশন ইউটিলিটি (Toast Notification Utility)
    // =================================================================
    function showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        if (!container) return; // সেফটি চেক
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        // টাইপ অনুযায়ী আইকন সেট করা
        let icon = '<i class="fa-solid fa-circle-check"></i>';
        if (type === 'danger') icon = '<i class="fa-solid fa-circle-exclamation"></i>';
        if (type === 'warning') icon = '<i class="fa-solid fa-triangle-exclamation"></i>';

        toast.innerHTML = `${icon} <span>${message}</span>`;
        container.appendChild(toast);

        // ৪ সেকেন্ড পর টোস্টটি রিমুভ হবে
        setTimeout(() => {
            toast.style.animation = 'toastSlideIn 0.3s ease reverse forwards';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }


// =================================================================
    // ৩. ড্যাশবোর্ড ট্যাব সুইচিং লজিক (Tab Switching Logic - Fixed Syntax)
    // =================================================================
    const menuItems = document.querySelectorAll('.menu-item[data-tab]');
    const tabContents = document.querySelectorAll('.tab-content');

    menuItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetTab = item.getAttribute('data-tab');

            // একটিভ ক্লাস পরিবর্তন
            menuItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active'); // 🌟 ফিক্সড: ভুল 'item.add' বাদ দিয়ে সঠিক জাভাস্ক্রিপ্ট সিনট্যাক্স করা হলো

            // কনটেন্ট সেকশন শো/হাইড করা
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === targetTab) {
                    content.classList.add('active');
                }
            });

            // ইউজার যদি 'My Orders' ট্যাবে ক্লিক করে তবে অর্ডার লোড হবে
            if (targetTab === 'my-orders') {
                fetchUserOrders();
            }
        });
    });


    // =================================================================
    // ৪. ইউজারের প্রোফাইল ডাটা ফেচ করা (Fetch Profile & Auto-Cache)
    // =================================================================
    async function fetchUserProfile() {
        try {
            const res = await fetch('/api/customer/profile', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            const data = await res.json();

            if (res.ok) {
                // সাইডবার ও ফর্ম ডেটা পপুলেট করা
                if (sidebarName) sidebarName.textContent = data.name || 'User';
                if (sidebarEmail) sidebarEmail.textContent = data.email || '';
                if (data.avatar && sidebarAvatar) sidebarAvatar.src = data.avatar;

                if (profileName) profileName.value = data.name || '';
                if (profileEmail) profileEmail.value = data.email || '';
                if (profilePhone) profilePhone.value = data.phone || '';
                if (profileAddress) profileAddress.value = data.address || '';

                // চেকআউটের জন্য লোকাল স্টোরেজে অটো-সেভ (Cache)
                localStorage.setItem('checkout_name', data.name || '');
                localStorage.setItem('checkout_phone', data.phone || '');
                localStorage.setItem('checkout_address', data.address || '');

            } else {
                showToast(data.message || 'Failed to load profile.', 'danger');
            }
        } catch (error) {
            console.error('Fetch Profile Error:', error);
            showToast('Server error while loading profile.', 'danger');
        }
    }

    fetchUserProfile(); // পেজ লোড হওয়ার সাথে সাথে কল হবে

    // =================================================================
    // ৫. প্রোফাইল ইনফরমেশন আপডেট করা (Update Profile)
    // =================================================================
    if (profileForm) {
        profileForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const updatedData = {
                name: profileName.value.trim(),
                phone: profilePhone.value.trim(),
                address: profileAddress.value.trim()
            };

            if (!updatedData.name) {
                showToast('Full Name is required!', 'warning');
                return;
            }

            try {
                const res = await fetch('/api/customer/update-profile', {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(updatedData)
                });

                const data = await res.json();

                if (res.ok) {
                    showToast('Profile updated successfully!', 'success');
                    if (sidebarName) sidebarName.textContent = data.user.name;
                    
                    localStorage.setItem('checkout_name', data.user.name);
                    localStorage.setItem('checkout_phone', data.user.phone || '');
                    localStorage.setItem('checkout_address', data.user.address || '');
                } else {
                    showToast(data.message || 'Update failed.', 'danger');
                }
            } catch (error) {
                console.error('Update Profile Error:', error);
                showToast('Server error during update.', 'danger');
            }
        });
    }

    // =================================================================
    // ৬. প্রোফাইল ছবি/অবতার আপলোড লজিক (Avatar Upload with Compression)
    // =================================================================
    if (avatarInput) {
        avatarInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // ফাইল সাইজ ভ্যালিডেশন (Max 5MB)
            if (file.size > 5 * 1024 * 1024) {
                showToast('Image size should be less than 5MB', 'warning');
                return;
            }

            // ফ্রন্টএন্ডে ইনস্ট্যান্ট প্রিভিউ দেখানো
            const reader = new FileReader();
            reader.onload = (event) => {
                if (sidebarAvatar) sidebarAvatar.src = event.target.result;
            };
            reader.readAsDataURL(file);

            const formData = new FormData();
            formData.append('avatar', file);

            try {
                showToast('Uploading and compressing image...', 'warning');
                const res = await fetch('/api/customer/update-avatar', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData
                });

                const data = await res.json();

                if (res.ok) {
                    showToast('Profile picture updated successfully!', 'success');
                    if (sidebarAvatar) sidebarAvatar.src = data.avatarUrl;
                } else {
                    showToast(data.message || 'Avatar upload failed.', 'danger');
                }
            } catch (error) {
                console.error('Avatar Upload Error:', error);
                showToast('Server error while uploading photo.', 'danger');
            }
        });
    }

// =================================================================
    // ৭. ইউজারের লাইভ অর্ডারসমূহ লোড করা (Fetch & Render Orders)
    // =================================================================
    async function fetchUserOrders() {
        if (!ordersListTbody) return;
        
        try {
            const res = await fetch('/api/orders/my-orders', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache' 
                }
            });

            const data = await res.json();

            if (res.ok) {
                ordersListTbody.innerHTML = ''; 

                if (!data.data || data.data.length === 0) {
                    ordersListTbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding:2rem; color:var(--text-muted);">You haven't placed any orders yet.</td></tr>`;
                    return;
                }

                data.data.forEach(order => {
                    const orderDate = new Date(order.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
                    const productNames = order.items.map(item => item.name).join(', ');

                    const currentStatus = order.status || 'Pending';
                    let statusBadgeClass = 'pending';
                    if (currentStatus.toLowerCase() === 'delivered') {
                        statusBadgeClass = 'delivered';
                    } else if (currentStatus.toLowerCase() !== 'pending') {
                        statusBadgeClass = 'processing';
                    }

                    // 🌟 ফিক্স: যেকোনো ধরনের আইডি যেন সঠিকভাবে ধরতে পারে
                    const firstItem = order.items[0] || {};
                    const reviewTargetId = firstItem.productId || firstItem.id || firstItem._id;

                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td><b>#${order.orderId || order._id.substring(18).toUpperCase()}</b></td>
                        <td>${orderDate}</td>
                        <td title="${productNames}">${productNames.length > 30 ? productNames.substring(0, 30) + '...' : productNames}</td>
                        <td>$${order.totalAmount}</td>
                        <td><span class="status-badge ${statusBadgeClass}">${currentStatus}</span></td>
                        <td class="text-center">
                            ${currentStatus.toLowerCase() === 'delivered' 
                                ? `<button class="btn-table-action btn-review" data-id="${reviewTargetId}">Review</button>` 
                                : `<span style="font-size:0.85rem; color:var(--text-muted);">In Progress</span>`
                            }
                        </td>
                    `;
                    ordersListTbody.appendChild(row);
                });

                setupReviewButtons();

            } else {
                ordersListTbody.innerHTML = `<tr><td colspan="6" class="text-center" style="color:var(--danger);">Failed to load orders.</td></tr>`;
            }
        } catch (error) {
            console.error('Fetch Orders Error:', error);
            ordersListTbody.innerHTML = `<tr><td colspan="6" class="text-center" style="color:var(--danger);">Server error while fetching orders.</td></tr>`;
        }
    }





    // =================================================================
    // ৮. রিভিউ মডাল ও স্টার সাবমিশন লজিক (Review Modal Sync)
    // =================================================================
    const reviewModal = document.getElementById('review-modal');
    const closeModal = document.querySelector('.close-modal');
    const reviewForm = document.getElementById('review-form');
    const reviewProductIdInput = document.getElementById('review-product-id');

    function setupReviewButtons() {
        const reviewBtns = document.querySelectorAll('.btn-review');
        reviewBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const productId = btn.getAttribute('data-id');
                
                if (reviewProductIdInput) {
                    reviewProductIdInput.value = productId;
                }
                
                if (reviewForm) {
                    reviewForm.reset();
                }
                
                if (reviewModal) {
                    reviewModal.classList.remove('hidden');
                }
            });
        });
    }

    if (closeModal && reviewModal) {
        closeModal.addEventListener('click', () => reviewModal.classList.add('hidden'));
    }

    window.addEventListener('click', (e) => {
        if (e.target === reviewModal) {
            reviewModal.classList.add('hidden');
        }
    });

    if (reviewForm) {
        reviewForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const productId = reviewProductIdInput ? reviewProductIdInput.value : '';
            const comment = document.getElementById('review-comment').value.trim();
            const selectedRatingInput = document.querySelector('input[name="rating"]:checked');
            
            if (!selectedRatingInput) {
                showToast('Please select a star rating!', 'warning');
                return;
            }
            
            const rating = selectedRatingInput.value;

            try {
                const res = await fetch(`/api/products/${productId}/reviews`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ rating: Number(rating), comment })
                });

                const data = await res.json();
                if (res.ok) {
                    showToast('Thank you! Review submitted successfully.', 'success');
                    reviewModal.classList.add('hidden');
                } else {
                    showToast(data.message || 'Submission failed.', 'danger');
                }
            } catch (error) {
                console.error('Submit Review Error:', error);
                showToast('Server error while submitting review.', 'danger');
            }
        });
    }

    // =================================================================
    // ৯. সিকিউরিটি এবং পাসওয়ার্ড আপডেট লজিক (Security & Password)
    // =================================================================
    if (passwordForm) {
        passwordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const currentPassword = document.getElementById('current-password').value;
            const newPassword = document.getElementById('new-password').value;
            const confirmPassword = document.getElementById('confirm-password').value;

            if (newPassword.length < 6) {
                showToast('New password must be at least 6 characters!', 'warning');
                return;
            }

            if (newPassword !== confirmPassword) {
                showToast('Confirm password does not match!', 'warning');
                return;
            }

            try {
                const res = await fetch('/api/customer/change-password', {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ currentPassword, newPassword })
                });

                const data = await res.json();
                if (res.ok) {
                    showToast('Password updated successfully!', 'success');
                    passwordForm.reset();
                } else {
                    showToast(data.message || 'Failed to change password.', 'danger');
                }
            } catch (error) {
                console.error('Change Password Error:', error);
                showToast('Server error during password update.', 'danger');
            }
        });
    }

    const togglePasswordIcon = document.querySelector('.toggle-password');
    if (togglePasswordIcon) {
        togglePasswordIcon.addEventListener('click', () => {
            const passwordInput = document.getElementById('current-password');
            if (!passwordInput) return;
            
            if (passwordInput.type === 'password') {
                passwordInput.type = 'text';
                togglePasswordIcon.classList.replace('fa-eye-slash', 'fa-eye');
            } else {
                passwordInput.type = 'password';
                togglePasswordIcon.classList.replace('fa-eye', 'fa-eye-slash');
            }
        });
    }

// =================================================================
    // ১০. লগআউট হ্যান্ডেলার (Logout System)
    // =================================================================
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            
            // লোকাল স্টোরেজ থেকে সব টোকেন ও ডাটা মুছে ফেলা
            localStorage.removeItem('token');
            localStorage.removeItem('customerToken'); // ব্যাকআপ হিসেবে এটিও মুছে দিচ্ছি
            
            localStorage.removeItem('checkout_name');
            localStorage.removeItem('checkout_phone');
            localStorage.removeItem('checkout_address');
            
            // টোস্ট নোটিফিকেশন দেখানো
            showToast('Logged out successfully. Redirecting...', 'warning');
            
            // ১.৫ সেকেন্ড পর হোম পেজে রিডাইরেক্ট হবে
            setTimeout(() => {
                window.location.href = 'index.html'; // সরাসরি index.html এ নিয়ে যাবে
            }, 1500);
        });
    }
}); // এই ব্র্যাকেটটি DOMContentLoaded শেষ করার জন্য অত্যন্ত জরুরি




