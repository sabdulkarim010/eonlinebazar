/**
 * File Name: profile.js
 * Location: client/js/profile.js
 * Description: Advanced Frontend Controller for EonlineBazar User Dashboard
 * Developer: Abdul Karim
 */

document.addEventListener('DOMContentLoaded', () => {
    // =================================================================
    // ১. গ্লোবাল ভেরিয়েবল এবং টোকেন ভেরিফিকেশন (Initialization & Security)
    // =================================================================
    const token = localStorage.getItem('token') || localStorage.getItem('customerToken');
    
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    // --- সিলেক্টরস (এখানে আইডি সংশোধন করা হয়েছে) ---
    const sidebarName = document.getElementById('sidebar-name');
    const sidebarEmail = document.getElementById('sidebar-email');
    const sidebarAvatar = document.getElementById('sidebar-avatar');
    const navAvatar = document.getElementById('nav-avatar');
    const avatarInput = document.getElementById('avatar-input');
    
    const profileForm = document.getElementById('profile-form');
    const profileName = document.getElementById('profile-name');
    const profileEmail = document.getElementById('profile-email');
    const profilePhone = document.getElementById('profile-phone');
    const profileAddress = document.getElementById('profile-address');
    
    const passwordForm = document.getElementById('password-form');
    const togglePasswordIcon = document.querySelector('.toggle-password');
    
    const ordersListTbody = document.getElementById('orders-list-tbody');
    const mainBalanceAmount = document.getElementById('main-balance-amount');
    const mainPointsAmount = document.getElementById('main-points-amount');
    const logoutBtn = document.getElementById('logout-btn');

    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    
    // এইচটিএমএল-এর 'id="mobile-menu-toggle"' এর সাথে মিল রেখে পরিবর্তন করা হলো
    const mobileToggleBtn = document.getElementById('mobile-menu-toggle'); 
    const sidebar = document.querySelector('.sidebar');
    const menuItems = document.querySelectorAll('[data-tab]');
    const tabContents = document.querySelectorAll('.tab-content');

    // =================================================================
    // ২. প্রিমিয়াম টোস্ট নোটিফিকেশন সিস্টেম (Advanced Toast System)
    // =================================================================
    function showToast(message, type = 'success') {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-wrapper';
            document.body.appendChild(container);
        }
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        let icon = type === 'danger' ? 'fa-circle-exclamation' : (type === 'warning' ? 'fa-triangle-exclamation' : 'fa-circle-check');
        toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'toastSlideIn 0.3s ease reverse forwards';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    // =================================================================
    // ৩. ডায়নামিক থিম সিস্টেম (Dark Mode Switcher)
    // =================================================================
    function initTheme() {
        const savedTheme = localStorage.getItem('eob_theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        if (themeToggleBtn) {
            const icon = themeToggleBtn.querySelector('i');
            if (icon) {
                icon.className = savedTheme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
            }
        }
    }

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            const newTheme = isDark ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('eob_theme', newTheme);
            const icon = themeToggleBtn.querySelector('i');
            if (icon) {
                icon.className = isDark ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
            }
            showToast(`${newTheme.charAt(0).toUpperCase() + newTheme.slice(1)} mode activated!`, 'success');
        });
    }
    initTheme();

    // =================================================================
    // Back to Home navigation
    // =================================================================
    const backToHomeBtn = document.getElementById('back-to-home-btn');
    if (backToHomeBtn) {
        backToHomeBtn.addEventListener('click', () => {
            window.location.href = '/';
        });
    }

    // =================================================================
    // ৪. মোবাইল ড্রয়ার টগল লজিক (Responsive Drawer)
    // =================================================================
    if (mobileToggleBtn && sidebar) {
        mobileToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('open');
            console.log("৩-লাইন বাটনে ক্লিক হয়েছে, সাইডবার টগল করা হলো।"); // টেস্টিং এর জন্য
        });
        
        document.addEventListener('click', (e) => {
            if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && e.target !== mobileToggleBtn) {
                sidebar.classList.remove('open');
            }
        });
    } else {
        console.error("মোবাইল টগল বাটন অথবা সাইডবার এলিমেন্ট খুঁজে পাওয়া যায়নি!");
    }

    // =================================================================
    // ৫. ড্যাশবোর্ড ট্যাব সুইচিং (Tab System)
    // =================================================================
    menuItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetTab = item.getAttribute('data-tab');
            menuItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === targetTab) content.classList.add('active');
            });

            if (window.innerWidth <= 768 && sidebar) sidebar.classList.remove('open');

            // লাইভ ডেটা রিফ্রেশ
            if (['my-orders', 'dashboard-overview'].includes(targetTab) && typeof fetchUserOrders === 'function') fetchUserOrders();
            if (targetTab === 'my-cart' && typeof fetchLiveDBCart === 'function') fetchLiveDBCart();
        });
    });

    // =================================================================
    // ৬. ইউজারের প্রোфাইল ডাটা ফেচ করা (Fetch Profile & Auto-Cache)
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
                if (sidebarName) sidebarName.textContent = data.name || 'User';
                if (sidebarEmail) sidebarEmail.textContent = data.email || '';
                
                // সাইডবার এবং টপ নেভবার উভয় জায়গায় অবতার আপডেট
                if (data.avatar) {
                    if (sidebarAvatar) sidebarAvatar.src = data.avatar;
                    if (navAvatar) navAvatar.src = data.avatar;
                }

                if (profileName) profileName.value = data.name || '';
                if (profileEmail) profileEmail.value = data.email || '';
                if (profilePhone) profilePhone.value = data.phone || '';
                if (profileAddress) profileAddress.value = data.address || '';

                const displayNameEls = document.querySelectorAll('.user-display-name');
                displayNameEls.forEach(el => {
                    el.textContent = data.name || 'User';
                });

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

    // =================================================================
    // ৬.১ ড্যাশবোর্ড স্ট্যাটাস ফেচ করা (Fetch Dashboard Stats)
    // =================================================================
    async function fetchDashboardStats() {
        try {
            console.log("ড্যাশবোর্ড ফেচ রিকোয়েস্ট পাঠানো হচ্ছে...");
            
            const res = await fetch('/api/orders/dashboard-stats', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            const rawData = await res.json();
            console.log("সার্ভার থেকে পাওয়া আসল ডাটা:", rawData);

            if (res.ok && rawData.success) {
                const totalOrdersEl = document.getElementById('stat-total-orders');
                const pendingOrdersEl = document.getElementById('stat-pending-orders');
                const balanceEl = document.getElementById('stat-wallet-balance');
                const pointsEl = document.getElementById('stat-loyalty-points');

                if (totalOrdersEl) {
                    totalOrdersEl.textContent = (rawData.totalOrders !== undefined) ? rawData.totalOrders : (rawData.data?.totalOrders || 0);
                }
                if (pendingOrdersEl) {
                    pendingOrdersEl.textContent = (rawData.pendingOrders !== undefined) ? rawData.pendingOrders : (rawData.data?.pendingOrders || 0);
                }
                if (balanceEl) {
                    const currentBalance = (rawData.balance !== undefined) ? rawData.balance : (rawData.data?.balance || 0);
                    balanceEl.textContent = '৳' + currentBalance.toLocaleString();
                }
                if (pointsEl) {
                    pointsEl.textContent = (rawData.loyaltyPoints !== undefined) ? rawData.loyaltyPoints : (rawData.data?.loyaltyPoints || 0);
                }
                
                const dashboardTableBody = document.getElementById('dashboard-orders-tbody'); 
                
                if (dashboardTableBody) {
                    const recentOrders = rawData.recentOrders || rawData.data?.recentOrders || [];

                    if (recentOrders.length > 0) {
                        dashboardTableBody.innerHTML = ''; 
                        
                        recentOrders.forEach(order => {
                            const orderDate = new Date(order.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
                            const safeItems = order.items || [];
                            const productNames = safeItems.map(item => item.name).join(', ') || 'Unknown Item';

                            const currentStatus = order.status || 'Pending';
                            let statusBadgeClass = 'pending';
                            
                            if (currentStatus.toLowerCase() === 'delivered') {
                                statusBadgeClass = 'delivered';
                            } else if (currentStatus.toLowerCase() === 'shipped') {
                                statusBadgeClass = 'shipped';
                            }

                            const displayOrderId = order.orderId ? order.orderId : (order._id ? order._id.substring(order._id.length - 6).toUpperCase() : 'N/A');

                            dashboardTableBody.innerHTML += `
                                <tr>
                                    <td><a href="#" class="order-id-link">#${displayOrderId}</a></td>
                                    <td>${orderDate}</td>
                                    <td title="${productNames}">${productNames.length > 30 ? productNames.substring(0, 30) + '...' : productNames}</td>
                                    <td style="font-weight:600; color:var(--primary-color);">৳${order.totalAmount || 0}</td>
                                    <td><span class="status-badge ${statusBadgeClass}">${currentStatus}</span></td>
                                </tr>
                            `;
                        });
                    }
                }

            } else {
                console.error("সার্ভার রেসপন্স ওকে নয়:", rawData.message);
            }
        } catch (error) {
            console.error('Error fetching dashboard stats:', error);
        }
    }

    // =================================================================
    // ৭. প্রোফাইল ইনফরমেশন আপডেট করা (Update Profile Details)
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
                const submitBtn = profileForm.querySelector('button[type="submit"]');
                const originalText = submitBtn.innerHTML;
                submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Updating...';
                submitBtn.disabled = true;

                const res = await fetch('/api/customer/update-profile', {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(updatedData)
                });

                const data = await res.json();

                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;

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
                
                const submitBtn = profileForm.querySelector('button[type="submit"]');
                if(submitBtn) {
                    submitBtn.innerHTML = 'Save Changes';
                    submitBtn.disabled = false;
                }
            }
        });
    }







// =================================================================
    // ৮. প্রোফাইল ছবি/অবতার আপলোড লজিক (Avatar Upload & Preview)
    // =================================================================
    if (avatarInput) {
        avatarInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (file.size > 5 * 1024 * 1024) {
                showToast('Image size should be less than 5MB', 'warning');
                return;
            }

            const reader = new FileReader();
            reader.onload = (event) => {
                if (sidebarAvatar) sidebarAvatar.src = event.target.result;
                if (navAvatar) navAvatar.src = event.target.result; 
            };
            reader.readAsDataURL(file);

            const formData = new FormData();
            formData.append('avatar', file);

            try {
                showToast('Uploading image...', 'warning');
                
                const res = await fetch('/api/customer/update-avatar', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData
                });

                const data = await res.json();

                if (res.ok) {
                    showToast('Profile picture updated successfully!', 'success');
                    if (sidebarAvatar) sidebarAvatar.src = data.avatarUrl; 
                    if (navAvatar) navAvatar.src = data.avatarUrl; 
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
    // ৯. ইউজারের লাইভ অর্ডারসমূহ লোড করা (Fetch & Render Orders)
    // =================================================================
    async function fetchUserOrders() {
        if (!ordersListTbody) return;
        
        try {
            ordersListTbody.innerHTML = `<tr><td colspan="5" class="text-center" style="padding:2rem;"><i class="fa-solid fa-spinner fa-spin" style="font-size:2rem; color:var(--primary-color);"></i><br><br>Loading your orders...</td></tr>`;

            const res = await fetch('/api/orders/my-orders', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache' 
                }
            });

            const rawData = await res.json();

            if (res.ok) {
                ordersListTbody.innerHTML = ''; 

                let orderList = rawData.data || rawData.orders || (Array.isArray(rawData) ? rawData : []);

                if (!orderList || orderList.length === 0) {
                    ordersListTbody.innerHTML = `<tr><td colspan="5" class="text-center" style="padding:2rem; color:var(--text-muted);"><i class="fa-solid fa-box-open" style="font-size:3rem; margin-bottom:10px; opacity:0.5;"></i><br>You haven't placed any orders yet.</td></tr>`;
                    return;
                }

                // --- নতুন অর্ডার সবার উপরে দেখানোর সর্টিং লজিক (Newest First) ---
                orderList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

                orderList.forEach(order => {
                    const orderDate = new Date(order.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
                    const safeItems = order.items || [];
                    const productNames = safeItems.map(item => item.name).join(', ') || 'Unknown Item';

                    const currentStatus = order.status || 'Pending';
                    let statusBadgeClass = 'pending';
                    
                    if (currentStatus.toLowerCase() === 'delivered') {
                        statusBadgeClass = 'delivered';
                    } else if (currentStatus.toLowerCase() === 'shipped') {
                        statusBadgeClass = 'shipped';
                    }

                    const displayOrderId = order.orderId ? order.orderId : (order._id ? order._id.substring(order._id.length - 6).toUpperCase() : 'N/A');

                    const row = document.createElement('tr');
                    
                    row.innerHTML = `
                        <td><a href="#" class="order-id-link" data-id="${order._id}">#${displayOrderId}</a></td>
                        <td>${orderDate}</td>
                        <td title="${productNames}">${productNames.length > 30 ? productNames.substring(0, 30) + '...' : productNames}</td>
                        <td style="font-weight:600; color:var(--primary-color);">৳${order.totalAmount || 0}</td>
                        <td><span class="status-badge ${statusBadgeClass}">${currentStatus}</span></td>
                    `;
                    ordersListTbody.appendChild(row);
                });

            } else {
                ordersListTbody.innerHTML = `<tr><td colspan="5" class="text-center" style="color:var(--danger); padding:2rem;"><i class="fa-solid fa-triangle-exclamation"></i> Failed to load orders. (${rawData.message || 'Error'})</td></tr>`;
            }
        } catch (error) {
            console.error('Fetch Orders Error:', error);
            ordersListTbody.innerHTML = `<tr><td colspan="5" class="text-center" style="color:var(--danger); padding:2rem;"><i class="fa-solid fa-server"></i> Server connection error.</td></tr>`;
        }
    }

    // =================================================================
    // ১০. রিভিউ মডাল ও স্টার সাবমিশন লজিক (Review Modal & Rating)
    // =================================================================
    const reviewModal = document.getElementById('review-modal');
    const closeModal = document.querySelector('.close-modal');
    const reviewForm = document.getElementById('review-form');
    const reviewProductIdInput = document.getElementById('review-product-id');

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
            const commentInput = document.getElementById('review-comment');
            const comment = commentInput ? commentInput.value.trim() : '';
            const selectedRatingInput = document.querySelector('input[name="rating"]:checked');
            
            if (!selectedRatingInput) {
                showToast('Please select a star rating!', 'warning');
                return;
            }
            
            const rating = selectedRatingInput.value;
            const submitBtn = reviewForm.querySelector('button[type="submit"]');

            try {
                const originalText = submitBtn.innerHTML;
                submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...';
                submitBtn.disabled = true;

                const res = await fetch(`/api/products/${productId}/reviews`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ rating: Number(rating), comment })
                });

                const data = await res.json();
                
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;

                if (res.ok) {
                    showToast('Thank you! Review submitted successfully.', 'success');
                    reviewModal.classList.add('hidden');
                } else {
                    showToast(data.message || 'Submission failed.', 'danger');
                }
            } catch (error) {
                console.error('Submit Review Error:', error);
                showToast('Server error while submitting review.', 'danger');
                submitBtn.innerHTML = 'Submit Review';
                submitBtn.disabled = false;
            }
        });
    }

    // =================================================================
    // ১১. সিকিউরিটি এবং পাসওয়ার্ড আপডেট লজিক (Security & Password)
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
                const submitBtn = passwordForm.querySelector('button[type="submit"]');
                const originalText = submitBtn.innerHTML;
                submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Updating...';
                submitBtn.disabled = true;

                const res = await fetch('/api/customer/change-password', {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ currentPassword, newPassword })
                });

                const data = await res.json();
                
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;

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
    // ১২. লগআউট হ্যান্ডেলার (Secure Logout System with Custom Modal)
    // =================================================================
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            
            // আগের ব্রাউজার অ্যালার্ট রিমুভ করে নতুন কাস্টম মডাল তৈরি করা হচ্ছে
            const overlay = document.createElement('div');
            overlay.id = 'custom-logout-overlay';
            overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; z-index: 9999; opacity: 0; transition: opacity 0.3s ease; backdrop-filter: blur(3px);';
            
            const modalBox = document.createElement('div');
            modalBox.style.cssText = 'background: var(--bg-color, #ffffff); padding: 30px 25px; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); text-align: center; max-width: 350px; width: 90%; transform: translateY(-20px); transition: transform 0.3s ease; font-family: inherit;';
            
            // মডালের ভেতরের ডিজাইন (আইকন, টেক্সট এবং বাটন)
            modalBox.innerHTML = `
                <div style="width: 65px; height: 65px; background: #fee2e2; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 15px;">
                    <i class="fa-solid fa-right-from-bracket" style="font-size: 26px; color: #ef4444;"></i>
                </div>
                <h3 style="margin: 0 0 8px; color: var(--text-color, #1e293b); font-size: 22px; font-weight: 700;">Sign Out?</h3>
                <p style="margin: 0 0 25px; color: var(--text-muted, #64748b); font-size: 15px; line-height: 1.5;">Are you sure you want to securely log out of your account?</p>
                <div style="display: flex; gap: 12px; justify-content: center;">
                    <button id="cancel-logout-btn" style="flex: 1; padding: 12px 0; border: none; background: #f1f5f9; color: #475569; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; transition: background 0.2s;">Cancel</button>
                    <button id="confirm-logout-btn" style="flex: 1; padding: 12px 0; border: none; background: #ef4444; color: white; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; transition: background 0.2s;">Yes, Sign Out</button>
                </div>
            `;
            
            overlay.appendChild(modalBox);
            document.body.appendChild(overlay);
            
            // পপআপ এনিমেশন চালু করা
            setTimeout(() => {
                overlay.style.opacity = '1';
                modalBox.style.transform = 'translateY(0)';
            }, 10);
            
            // মডাল ক্লোজ করার ফাংশন
            function closeLogoutModal() {
                overlay.style.opacity = '0';
                modalBox.style.transform = 'translateY(-20px)';
                setTimeout(() => overlay.remove(), 300);
            }

            // ক্যান্সেল বাটনে ক্লিক করলে
            document.getElementById('cancel-logout-btn').addEventListener('click', closeLogoutModal);
            
            // মডালের বাইরের ফাঁকা জায়গায় ক্লিক করলে
            overlay.addEventListener('click', (e) => {
                if(e.target === overlay) closeLogoutModal();
            });
            
            // কনফার্ম (Yes, Sign Out) বাটনে ক্লিক করলে লগআউট প্রসেস শুরু হবে
            document.getElementById('confirm-logout-btn').addEventListener('click', () => {
                const confirmBtn = document.getElementById('confirm-logout-btn');
                confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Logging out...';
                confirmBtn.style.opacity = '0.8';
                
                // লোকাল স্টোরেজ ক্লিয়ার করা
                localStorage.removeItem('token');
                localStorage.removeItem('customerToken'); 
                localStorage.removeItem('checkout_name');
                localStorage.removeItem('checkout_phone');
                localStorage.removeItem('checkout_address');
                
                showToast('Logged out successfully. Redirecting...', 'success');
                
                // ১.৫ সেকেন্ড পর হোমপেজে পাঠানো
                setTimeout(() => {
                    closeLogoutModal();
                    window.location.href = '/index.html'; 
                }, 1500);
            });
        });
    }

    // =================================================================
    // ১৩. ইনিশিয়াল ডাটা লোড (Initial Data Fetching)
    // =================================================================
    fetchUserProfile();
    fetchDashboardStats();
    fetchUserOrders(); 


// অর্ডার আইডিতে ক্লিক করলে ডিটেইলস পেজে নিয়ে যাওয়ার লজিক
document.addEventListener('click', function(e) {
    if (e.target && e.target.classList.contains('order-id-link')) {
        e.preventDefault(); // ব্রাউজারের ডিফল্ট আচরণ (# যাওয়া) বন্ধ করবে
        
        const orderId = e.target.getAttribute('data-id');
        
        if (orderId) {
            // এখানে আপনার অর্ডার ডিটেইলস পেজের পাথ দিন
            window.location.href = `/order-details.html?id=${orderId}`;
        }
    }
});


});






