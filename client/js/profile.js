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
            if (targetTab === 'dashboard-overview') fetchDashboardStats();
            if (targetTab === 'my-cart') {
                if (typeof fetchLiveDBCart === 'function') fetchLiveDBCart();
                fetchWishlist();
            }
            if (targetTab === 'addresses-settings') fetchAddresses();
            if (targetTab === 'security-settings') fetchSessions();
            if (targetTab === 'wallet-points') fetchWalletData();
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
                // 🌟 ফিক্স: পুরোনো ইউজারদের নম্বর 'mobile' ফিল্ডে থাকতে পারে, তাই দুটোই চেক করা হলো
                if (profilePhone) profilePhone.value = data.phone || data.mobile || '';
                if (profileAddress) profileAddress.value = data.address || '';

                const displayNameEls = document.querySelectorAll('.user-display-name');
                displayNameEls.forEach(el => {
                    el.textContent = data.name || 'User';
                });

                // ওয়ালেট ও পয়েন্ট ডিসপ্লে আপডেট (Wallet tab)
                updateWalletDisplay(data.walletBalance || 0, data.loyaltyPoints || 0);
                renderCashbackHistory(data.walletHistory || []);

                localStorage.setItem('checkout_name', data.name || '');
                localStorage.setItem('checkout_phone', data.phone || data.mobile || '');
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
    // ৬.০ অর্ডার আইটেম স্ট্যাকিং হেল্পার (Stacked Order Items Renderer)
    // একাধিক প্রোডাক্ট একই সেলে একটির নিচে আরেকটি করে সাজানো হয়
    // =================================================================
    function buildOrderItemsHtml(items) {
        const safeItems = Array.isArray(items) ? items : [];

        if (safeItems.length === 0) {
            return `<div class="order-products-stack">
                        <span class="order-product-line">
                            <span class="order-product-name">Unknown Item</span>
                        </span>
                    </div>`;
        }

        const lines = safeItems.map(item => {
            const name = item.name || 'Unknown Item';
            const qty = item.quantity || item.qty || 1;
            return `<span class="order-product-line">
                        <span class="order-product-name" title="${name}">${name}</span>
                        <span class="order-product-qty">× ${qty}</span>
                    </span>`;
        }).join('');

        return `<div class="order-products-stack">${lines}</div>`;
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

                    if (recentOrders.length === 0) {
                        dashboardTableBody.innerHTML = `<tr><td colspan="5" class="text-center" style="padding:2rem; color:var(--text-muted);"><i class="fa-solid fa-box-open" style="font-size:2.5rem; margin-bottom:10px; opacity:0.5; display:block;"></i>No recent orders yet.</td></tr>`;
                    } else {
                        dashboardTableBody.innerHTML = ''; 
                        
                        recentOrders.forEach(order => {
                            const orderDate = new Date(order.createdAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
                            const itemsHtml = buildOrderItemsHtml(order.items);

                            const currentStatus = order.status || 'Pending';
                            let statusBadgeClass = 'pending';
                            
                            if (currentStatus.toLowerCase() === 'delivered') {
                                statusBadgeClass = 'delivered';
                            } else if (currentStatus.toLowerCase() === 'shipped') {
                                statusBadgeClass = 'shipped';
                            }

                            const displayOrderId = order.orderId ? order.orderId : (order._id ? order._id.substring(order._id.length - 6).toUpperCase() : 'N/A');

                            dashboardTableBody.innerHTML += `
                                <tr class="clickable-order-row" data-id="${order._id}">
                                    <td><a href="#" class="order-id-link" data-id="${order._id}">#${displayOrderId}</a></td>
                                    <td>${orderDate}</td>
                                    <td class="order-products-cell">${itemsHtml}</td>
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
                    const itemsHtml = buildOrderItemsHtml(order.items);

                    const currentStatus = order.status || 'Pending';
                    let statusBadgeClass = 'pending';
                    
                    if (currentStatus.toLowerCase() === 'delivered') {
                        statusBadgeClass = 'delivered';
                    } else if (currentStatus.toLowerCase() === 'shipped') {
                        statusBadgeClass = 'shipped';
                    }

                    const displayOrderId = order.orderId ? order.orderId : (order._id ? order._id.substring(order._id.length - 6).toUpperCase() : 'N/A');

                    const row = document.createElement('tr');
                    row.className = 'clickable-order-row';
                    row.setAttribute('data-id', order._id);

                    row.innerHTML = `
                        <td><a href="#" class="order-id-link" data-id="${order._id}">#${displayOrderId}</a></td>
                        <td>${orderDate}</td>
                        <td class="order-products-cell">${itemsHtml}</td>
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
    // ১৩. ওয়ালেট ও লয়্যালটি পয়েন্ট (Wallet & Points Converter)
    // =================================================================
    function updateWalletDisplay(balance, points) {
        const balanceEl = document.getElementById('main-balance-amount');
        const pointsEl = document.getElementById('current-points-calc');
        if (balanceEl) balanceEl.textContent = '৳' + Number(balance || 0).toLocaleString();
        if (pointsEl) pointsEl.textContent = Number(points || 0).toLocaleString() + ' XP';
    }

    function renderCashbackHistory(history) {
        const list = document.getElementById('cashback-list');
        if (!list) return;
        if (!history || history.length === 0) {
            list.innerHTML = `<li class="history-item empty">No recent cashback transactions.</li>`;
            return;
        }
        list.innerHTML = '';
        history.slice(0, 8).forEach(tx => {
            const date = new Date(tx.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
            const isDeduct = tx.type === 'debit';
            const sign = isDeduct ? '-' : '+';
            list.innerHTML += `
                <li class="history-item">
                    <span>${tx.note || tx.type} <small style="color:var(--text-muted);">• ${date}</small></span>
                    <span class="history-amount ${isDeduct ? 'deduct' : ''}">${sign}৳${Number(tx.amount || 0).toLocaleString()}</span>
                </li>
            `;
        });
    }

    async function fetchWalletData() {
        try {
            const res = await fetch('/api/customer/profile', {
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            if (res.ok) {
                updateWalletDisplay(data.walletBalance || 0, data.loyaltyPoints || 0);
                renderCashbackHistory(data.walletHistory || []);
            }
        } catch (error) {
            console.error('Fetch Wallet Error:', error);
        }
    }

    const convertPointsBtn = document.getElementById('convert-points-btn');
    if (convertPointsBtn) {
        convertPointsBtn.addEventListener('click', async () => {
            const input = document.getElementById('points-to-convert');
            const points = Number(input ? input.value : 0);

            if (!points || points <= 0) {
                showToast('Please enter the number of points to convert.', 'warning');
                return;
            }
            if (points < 100) {
                showToast('Minimum 100 points are required.', 'warning');
                return;
            }
            if (points % 100 !== 0) {
                showToast('Points must be in multiples of 100.', 'warning');
                return;
            }

            const originalText = convertPointsBtn.innerHTML;
            convertPointsBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Converting...';
            convertPointsBtn.disabled = true;

            try {
                const res = await fetch('/api/customer/convert-points', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ points })
                });
                const data = await res.json();

                convertPointsBtn.innerHTML = originalText;
                convertPointsBtn.disabled = false;

                if (res.ok && data.success) {
                    showToast(data.message, 'success');
                    if (input) input.value = '';
                    updateWalletDisplay(data.walletBalance, data.loyaltyPoints);
                    renderCashbackHistory(data.walletHistory || []);
                    // ড্যাশবোর্ড স্ট্যাট কার্ডও আপডেট করা
                    const balanceCard = document.getElementById('stat-wallet-balance');
                    const pointsCard = document.getElementById('stat-loyalty-points');
                    if (balanceCard) balanceCard.textContent = '৳' + Number(data.walletBalance).toLocaleString();
                    if (pointsCard) pointsCard.textContent = Number(data.loyaltyPoints).toLocaleString();
                } else {
                    showToast(data.message || 'Conversion failed.', 'danger');
                }
            } catch (error) {
                console.error('Convert Points Error:', error);
                convertPointsBtn.innerHTML = originalText;
                convertPointsBtn.disabled = false;
                showToast('Server error during conversion.', 'danger');
            }
        });
    }

    // =================================================================
    // ১৪. উইশলিস্ট (My Wishlist)
    // =================================================================
    function resolveProductImage(imageFile) {
        if (!imageFile) return '';
        const lower = imageFile.toLowerCase();
        const isImg = ['.jpg', '.png', '.jpeg', '.webp'].some(ext => lower.includes(ext));
        if (!isImg) return '';
        if (imageFile.startsWith('http') || imageFile.startsWith('/')) return imageFile;
        if (imageFile.startsWith('products/')) return '/' + imageFile;
        return '/products/' + imageFile;
    }

    async function fetchWishlist() {
        const container = document.getElementById('wishlist-items-list');
        if (!container) return;
        try {
            const res = await fetch('/api/customer/wishlist', {
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            if (res.ok && data.success) {
                renderWishlist(data.wishlist || []);
            } else {
                container.innerHTML = `<p class="text-center empty-cart-text">Could not load wishlist.</p>`;
            }
        } catch (error) {
            console.error('Fetch Wishlist Error:', error);
            container.innerHTML = `<p class="text-center empty-cart-text">Server error loading wishlist.</p>`;
        }
    }

    function renderWishlist(items) {
        const container = document.getElementById('wishlist-items-list');
        if (!container) return;

        if (!items || items.length === 0) {
            container.innerHTML = `
                <div class="wishlist-empty">
                    <i class="fa-regular fa-heart"></i>
                    <p>Your wishlist is empty.</p>
                    <a href="/" class="shop-now-link">Browse products</a>
                </div>`;
            return;
        }

        container.innerHTML = '';
        items.forEach(item => {
            const imgSrc = resolveProductImage(item.image);
            const media = imgSrc
                ? `<img src="${imgSrc}" alt="${item.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"><span class="wishlist-emoji" style="display:none;">${item.icon || '📦'}</span>`
                : `<span class="wishlist-emoji">${item.icon || '📦'}</span>`;

            const card = document.createElement('div');
            card.className = 'wishlist-card';
            card.innerHTML = `
                <div class="wishlist-media">${media}</div>
                <div class="wishlist-info">
                    <h4 class="wishlist-name" title="${item.name}">${item.name || 'Product'}</h4>
                    <span class="wishlist-price">৳${Number(item.price || 0).toLocaleString()}</span>
                </div>
                <div class="wishlist-actions">
                    <button class="wishlist-cart-btn" data-id="${item.productId}" data-name="${item.name}" data-price="${item.price}" data-image="${item.image || ''}" data-icon="${item.icon || '📦'}" title="Move to cart">
                        <i class="fa-solid fa-cart-plus"></i>
                    </button>
                    <button class="wishlist-remove-btn" data-id="${item.productId}" title="Remove from wishlist">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            `;
            container.appendChild(card);
        });
    }

    // উইশলিস্টের রিমুভ ও মুভ-টু-কার্ট (ইভেন্ট ডেলিগেশন)
    document.addEventListener('click', async (e) => {
        const removeBtn = e.target.closest('.wishlist-remove-btn');
        const cartBtn = e.target.closest('.wishlist-cart-btn');

        if (removeBtn) {
            const productId = removeBtn.getAttribute('data-id');
            removeBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            try {
                const res = await fetch(`/api/customer/wishlist/${productId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    showToast('Removed from wishlist.', 'success');
                    renderWishlist(data.wishlist || []);
                } else {
                    showToast(data.message || 'Failed to remove.', 'danger');
                }
            } catch (error) {
                console.error('Remove Wishlist Error:', error);
                showToast('Server error.', 'danger');
            }
        }

        if (cartBtn && typeof window.addToBag === 'function') {
            const id = cartBtn.getAttribute('data-id');
            const name = cartBtn.getAttribute('data-name');
            const price = cartBtn.getAttribute('data-price');
            const image = cartBtn.getAttribute('data-image');
            window.addToBag(id, name, price, image);
            showToast('Added to cart!', 'success');
        }
    });

    // =================================================================
    // ১৫. ঠিকানা ম্যানেজমেন্ট (Addresses CRUD + Modal)
    // =================================================================
    const addressModal = document.getElementById('address-modal');
    const addressForm = document.getElementById('address-form');
    const addressModalTitle = document.getElementById('address-modal-title');

    function openAddressModal(editData = null) {
        if (!addressModal) return;
        const idField = document.getElementById('address-id');
        const labelField = document.getElementById('address-label');
        const phoneField = document.getElementById('address-phone');
        const fullField = document.getElementById('address-full');
        const defaultField = document.getElementById('address-default');

        if (editData) {
            addressModalTitle.textContent = 'Edit Address';
            idField.value = editData._id;
            labelField.value = editData.label || '';
            phoneField.value = editData.phone || '';
            fullField.value = editData.fullAddress || '';
            defaultField.checked = !!editData.isDefault;
        } else {
            addressModalTitle.textContent = 'Add New Address';
            addressForm.reset();
            idField.value = '';
        }
        addressModal.classList.remove('hidden');
    }

    function closeAddressModal() {
        if (addressModal) addressModal.classList.add('hidden');
    }

    const addAddressCard = document.getElementById('add-address-card');
    if (addAddressCard) addAddressCard.addEventListener('click', () => openAddressModal());

    const closeAddressBtn = document.getElementById('close-address-modal');
    const cancelAddressBtn = document.getElementById('cancel-address-btn');
    if (closeAddressBtn) closeAddressBtn.addEventListener('click', closeAddressModal);
    if (cancelAddressBtn) cancelAddressBtn.addEventListener('click', closeAddressModal);
    if (addressModal) {
        addressModal.addEventListener('click', (e) => { if (e.target === addressModal) closeAddressModal(); });
    }

    async function fetchAddresses() {
        const grid = document.getElementById('address-grid');
        if (!grid) return;
        try {
            const res = await fetch('/api/customer/addresses', {
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            if (res.ok && data.success) {
                renderAddresses(data.addresses || []);
            }
        } catch (error) {
            console.error('Fetch Addresses Error:', error);
        }
    }

    function renderAddresses(addresses) {
        const grid = document.getElementById('address-grid');
        if (!grid) return;

        // "Add New Address" কার্ডটি রেখে বাকি কার্ড রিসেট করা
        grid.querySelectorAll('.address-card').forEach(el => el.remove());

        const addCard = document.getElementById('add-address-card');
        addresses.forEach(addr => {
            const card = document.createElement('div');
            card.className = 'card address-card' + (addr.isDefault ? ' active' : '');
            card.innerHTML = `
                <span class="address-tag">
                    <i class="fa-solid fa-location-dot"></i> ${addr.label || 'Address'}${addr.isDefault ? ' (Default)' : ''}
                </span>
                <p class="address-text">${addr.fullAddress}</p>
                ${addr.phone ? `<p class="address-phone-text"><i class="fa-solid fa-phone"></i> ${addr.phone}</p>` : ''}
                <div class="address-card-actions">
                    <button class="btn-address-edit" data-id="${addr._id}"><i class="fa-regular fa-pen-to-square"></i> Edit</button>
                    <button class="btn-address-delete" data-id="${addr._id}"><i class="fa-regular fa-trash-can"></i> Delete</button>
                </div>
            `;
            card._addressData = addr;
            grid.insertBefore(card, addCard);
        });
    }

    // অ্যাড্রেস এডিট / ডিলিট (ইভেন্ট ডেলিগেশন)
    document.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.btn-address-edit');
        const deleteBtn = e.target.closest('.btn-address-delete');

        if (editBtn) {
            const card = editBtn.closest('.address-card');
            if (card && card._addressData) openAddressModal(card._addressData);
        }

        if (deleteBtn) {
            const addressId = deleteBtn.getAttribute('data-id');
            if (!confirm('Delete this address?')) return;
            try {
                const res = await fetch(`/api/customer/addresses/${addressId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    showToast('Address deleted.', 'success');
                    renderAddresses(data.addresses || []);
                } else {
                    showToast(data.message || 'Failed to delete.', 'danger');
                }
            } catch (error) {
                console.error('Delete Address Error:', error);
                showToast('Server error.', 'danger');
            }
        }
    });

    if (addressForm) {
        addressForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const addressId = document.getElementById('address-id').value;
            const payload = {
                label: document.getElementById('address-label').value.trim(),
                phone: document.getElementById('address-phone').value.trim(),
                fullAddress: document.getElementById('address-full').value.trim(),
                isDefault: document.getElementById('address-default').checked
            };

            if (!payload.fullAddress) {
                showToast('Full address is required.', 'warning');
                return;
            }

            const saveBtn = document.getElementById('save-address-btn');
            const originalText = saveBtn.innerHTML;
            saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
            saveBtn.disabled = true;

            try {
                const url = addressId ? `/api/customer/addresses/${addressId}` : '/api/customer/addresses';
                const method = addressId ? 'PUT' : 'POST';
                const res = await fetch(url, {
                    method,
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();

                saveBtn.innerHTML = originalText;
                saveBtn.disabled = false;

                if (res.ok && data.success) {
                    showToast(data.message || 'Address saved!', 'success');
                    renderAddresses(data.addresses || []);
                    closeAddressModal();
                } else {
                    showToast(data.message || 'Failed to save address.', 'danger');
                }
            } catch (error) {
                console.error('Save Address Error:', error);
                saveBtn.innerHTML = originalText;
                saveBtn.disabled = false;
                showToast('Server error while saving address.', 'danger');
            }
        });
    }

    // =================================================================
    // ১৬. সিকিউরিটি: অ্যাক্টিভ সেশন ও রিমোট লগআউট (Sessions)
    // =================================================================
    function sessionDeviceIcon(device) {
        const d = (device || '').toLowerCase();
        if (d.includes('phone') || d.includes('android') || d.includes('iphone')) return 'fa-mobile-screen-button';
        if (d.includes('ipad') || d.includes('tablet')) return 'fa-tablet-screen-button';
        return 'fa-laptop';
    }

    function timeAgo(dateStr) {
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Active now';
        if (mins < 60) return `${mins} min ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs} hr ago`;
        const days = Math.floor(hrs / 24);
        return `${days} day${days > 1 ? 's' : ''} ago`;
    }

    async function fetchSessions() {
        const list = document.getElementById('sessions-list');
        if (!list) return;
        try {
            const res = await fetch('/api/customer/sessions', {
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            if (res.ok && data.success) {
                renderSessions(data.sessions || []);
            } else {
                list.innerHTML = `<p class="text-center sessions-loading">Could not load sessions.</p>`;
            }
        } catch (error) {
            console.error('Fetch Sessions Error:', error);
            list.innerHTML = `<p class="text-center sessions-loading">Server error loading sessions.</p>`;
        }
    }

    function renderSessions(sessions) {
        const list = document.getElementById('sessions-list');
        if (!list) return;

        if (!sessions || sessions.length === 0) {
            list.innerHTML = `<p class="text-center sessions-loading">No active sessions found. Please log in again to track devices.</p>`;
            return;
        }

        list.innerHTML = '';
        sessions.forEach(s => {
            const icon = sessionDeviceIcon(s.device);
            const status = s.isCurrent ? 'This device' : timeAgo(s.lastActive);
            const item = document.createElement('div');
            item.className = 'activity-item' + (s.isCurrent ? ' current-session' : '');
            item.innerHTML = `
                <div class="activity-icon"><i class="fa-solid ${icon}"></i></div>
                <div class="activity-details">
                    <h4>${s.browser} / ${s.device} ${s.isCurrent ? '<span class="current-badge">Current</span>' : ''}</h4>
                    <p>${s.ip || 'Unknown IP'} • ${status}</p>
                </div>
                <button class="session-logout-btn" data-id="${s._id}" data-current="${s.isCurrent}">
                    <i class="fa-solid fa-right-from-bracket"></i> Logout
                </button>
            `;
            list.appendChild(item);
        });
    }

    // সেশন রিমোট লগআউট (ইভেন্ট ডেলিগেশন)
    document.addEventListener('click', async (e) => {
        const logoutSessionBtn = e.target.closest('.session-logout-btn');
        if (!logoutSessionBtn) return;

        const sessionId = logoutSessionBtn.getAttribute('data-id');
        const isCurrent = logoutSessionBtn.getAttribute('data-current') === 'true';

        logoutSessionBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        logoutSessionBtn.disabled = true;

        try {
            const res = await fetch(`/api/customer/sessions/${sessionId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();

            if (res.ok && data.success) {
                if (data.loggedOutCurrent || isCurrent) {
                    showToast('This device has been logged out. Redirecting...', 'success');
                    localStorage.removeItem('token');
                    localStorage.removeItem('customerToken');
                    setTimeout(() => { window.location.href = '/login.html'; }, 1500);
                } else {
                    showToast('Device logged out remotely.', 'success');
                    fetchSessions();
                }
            } else {
                showToast(data.message || 'Failed to log out device.', 'danger');
                logoutSessionBtn.disabled = false;
                logoutSessionBtn.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i> Logout';
            }
        } catch (error) {
            console.error('Logout Session Error:', error);
            showToast('Server error.', 'danger');
            logoutSessionBtn.disabled = false;
            logoutSessionBtn.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i> Logout';
        }
    });

    // =================================================================
    // ১৭. ইনিশিয়াল ডাটা লোড (Initial Data Fetching)
    // =================================================================
    fetchUserProfile();
    fetchDashboardStats();
    fetchUserOrders(); 
    fetchWishlist();


// অর্ডার আইডিতে ক্লিক করলে ডিটেইলস পেজে নিয়ে যাওয়ার লজিক
document.addEventListener('click', function(e) {
    const _orderTarget = e.target.closest('.order-id-link') || e.target.closest('.clickable-order-row');
    if (_orderTarget) {
        e.preventDefault(); // ব্রাউজারের ডিফল্ট আচরণ (# যাওয়া) বন্ধ করবে
        
        const orderId = _orderTarget.getAttribute('data-id');
        
        if (orderId) {
            // এখানে আপনার অর্ডার ডিটেইলস পেজের পাথ দিন
            window.location.href = `/order-details.html?id=${orderId}`;
        }
    }
});


});






