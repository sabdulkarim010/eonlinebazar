document.addEventListener('DOMContentLoaded', () => {
    // ১. ভেরিফাই কাস্টমার লগইন টোকেন (auth.js এর সাথে মিলিয়ে customerToken করা হলো)
    const token = localStorage.getItem('customerToken');
    if (!token) {
        showToast('Access Denied. Redirecting to login...', 'error');
        setTimeout(() => window.location.href = 'login.html', 2000);
        return;
    }

    // ২. ডম উপাদানসমূহ (DOM Elements)
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

    // ৩. সাইডবার ট্যাব সুইচিং লজিক
    const menuItems = document.querySelectorAll('.menu-item[data-tab]');
    const tabContents = document.querySelectorAll('.tab-content');

    menuItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            menuItems.forEach(i => i.classList.remove('active'));
            tabContents.forEach(tc => tc.classList.remove('active'));

            item.classList.add('active');
            const targetTab = item.getAttribute('data-tab');
            document.getElementById(targetTab).classList.add('active');
        });
    });

    // ৪. ডাটাবেজ থেকে কাস্টমার ডাটা লোড করা (Fetch Profile)
    async function loadUserProfile() {
        try {
            // আপনার server.js অনুযায়ী সঠিক রুট /api/customer/profile এ রিকোয়েস্ট পাঠানো হচ্ছে
            const response = await fetch('/api/customer/profile', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await response.json();

            if (response.ok) {
                // ফর্ম এবং সাইডবারে ডাটা সেট করা
                sidebarName.textContent = data.name;
                sidebarEmail.textContent = data.email;
                profileName.value = data.name;
                profileEmail.value = data.email;
                
                // ডাটাবেজের 'mobile' ফিল্ডের সাথে সিঙ্ক করা হলো (যদি phone না থাকে)
                profilePhone.value = data.mobile || data.phone || ''; 
                profileAddress.value = data.address || '';
                
                if (data.avatar) {
                    sidebarAvatar.src = data.avatar;
                }
            } else {
                showToast(data.message || 'Failed to load profile', 'error');
            }
        } catch (error) {
            showToast('Network error while fetching profile data.', 'error');
        }
    }

    // ৫. প্রোফাইল টেক্সট ডাটা আপডেট করা (Update Profile)
    profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const updatedData = {
            name: profileName.value.trim(),
            phone: profilePhone.value.trim(), // ব্যাকঅ্যান্ডের userController.js এর phone এর সাথে মিল রাখা হলো
            address: profileAddress.value.trim()
        };

        try {
            const response = await fetch('/api/customer/update-profile', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(updatedData)
            });

            const data = await response.json();

            if (response.ok) {
                showToast('Profile updated successfully!', 'success');
                sidebarName.textContent = updatedData.name;
                localStorage.setItem('userName', updatedData.name); // লোকাল স্টোরেজ সিঙ্ক
            } else {
                showToast(data.message || 'Update failed', 'error');
            }
        } catch (error) {
            showToast('Something went wrong. Try again.', 'error');
        }
    });

    // ৬. রিয়েল-টাইম প্রোফাইল পিকচার আপলোড লজিক (Avatar Upload via FormData)
    avatarInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // ফ্রন্টএন্ডে সাথে সাথে ইমেজ প্রিভিউ দেখানো
        const reader = new FileReader();
        reader.onload = (event) => {
            sidebarAvatar.src = event.target.result;
        };
        reader.readAsDataURL(file);

        // DN-সার্ভারে এবং ক্লাউডিনারিতে ফাইল পাঠানো
        const formData = new FormData();
        formData.append('avatar', file);

        try {
            showToast('Uploading photo...', 'success');
            const response = await fetch('/api/customer/update-avatar', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            const data = await response.json();

            if (response.ok) {
                showToast('Profile photo updated successfully!', 'success');
                sidebarAvatar.src = data.avatarUrl; // ক্লাউডিনারি ফাইনাল URL
            } else {
                showToast(data.message || 'Photo upload failed', 'error');
            }
        } catch (error) {
            showToast('Error uploading avatar image.', 'error');
        }
    });

    // ৭. পাসওয়ার্ড পরিবর্তন করার সিকিউর লজিক (Change Password)
    passwordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const currentPassword = document.getElementById('current-password').value;
        const newPassword = document.getElementById('new-password').value;
        const confirmPassword = document.getElementById('confirm-password').value;

        if (newPassword.length < 6) {
            showToast('New password must be at least 6 characters long.', 'error');
            return;
        }

        if (newPassword !== confirmPassword) {
            showToast('New passwords do not match.', 'error');
            return;
        }

        try {
            const response = await fetch('/api/customer/change-password', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ currentPassword, newPassword })
            });

            const data = await response.json();

            if (response.ok) {
                showToast('Password changed successfully!', 'success');
                passwordForm.reset();
            } else {
                showToast(data.message || 'Failed to change password', 'error');
            }
        } catch (error) {
            showToast('Error processing your request.', 'error');
        }
    });

    // ৮. লগআউট হ্যান্ডেলার (Logout - customerToken রিমুভ করা হলো)
    document.getElementById('logout-btn').addEventListener('click', () => {
        localStorage.removeItem('customerToken');
        localStorage.removeItem('userName');
        showToast('Logged out successfully.', 'success');
        setTimeout(() => window.location.href = 'login.html', 1500);
    });

    // ৯. প্রিমিয়াম টোস্ট মেসেজ নোটিফিকেশন সিস্টেম
    function showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icon = type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation';
        toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
        
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideIn 0.3s reverse forwards';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    // পেজ লোড হওয়ার সাথে সাথে ইউজারের প্রোফাইল ডাটা কল করা
    loadUserProfile();
});






