/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/core-boot.js
 * Description: Sync button, dashboard boot, logout, and profile picture.
 */
/* ==========================================================================
   SECTION 16: SYNC DATA BUTTON (টপ হেডারের সিঙ্ক/রিফ্রেশ বাটন)
   ========================================================================== */

function setupSyncButton() {
    const syncBtn = document.getElementById('refreshDataBtn');
    if (!syncBtn) return;

    syncBtn.addEventListener('click', async function() {
        if (this.disabled) return;
        this.disabled = true;

        const icon = this.querySelector('i');
        if (icon) icon.classList.add('fa-spin');

        if (typeof Swal !== 'undefined') {
            Swal.fire({
                title: 'Syncing data…',
                html: 'Flushing expired coupons &amp; fetching latest dashboard, orders, products &amp; catalog',
                allowOutsideClick: false,
                allowEscapeKey: false,
                didOpen: () => Swal.showLoading()
            });
        }

        try {
            await runAdminDataSync();

            await Promise.all([
                typeof fetchDashboardData === 'function' ? fetchDashboardData() : Promise.resolve(),
                typeof fetchLiveOrders === 'function' ? fetchLiveOrders() : Promise.resolve(),
                typeof fetchLiveProducts === 'function' ? fetchLiveProducts() : Promise.resolve(),
                typeof fetchCategories === 'function' ? fetchCategories() : Promise.resolve(),
                typeof loadCategories === 'function' ? loadCategories() : Promise.resolve(),
                typeof fetchBrands === 'function' ? fetchBrands() : Promise.resolve(),
                typeof fetchAttributes === 'function' ? fetchAttributes() : Promise.resolve(),
                typeof fetchSecurityLogs === 'function' ? fetchSecurityLogs() : Promise.resolve()
            ]);

            if (typeof Swal !== 'undefined') Swal.close();
            showAdminSuccess('Data Synchronized Successfully', 'Expired coupons flushed, dashboard, orders, products & catalog are up to date.');
        } catch (error) {
            console.error('Sync Error:', error);
            if (typeof Swal !== 'undefined') Swal.close();
            showToast('Sync failed. Check your connection.', 'error');
        } finally {
            this.disabled = false;
            if (icon) icon.classList.remove('fa-spin');
        }
    });
}

/* ==========================================================================
  SECTION 17 SYSTEM INITIALIZATION (সব কন্ট্রোলার একসাথে চালু করা)
   ========================================================================== */

/* ==========================================================================
   SECTION 18: Logout
   ========================================================================== */

// Sidebar logout: prefer the native <a href="/admin/logout"> navigation so
// sign-out still works if showToast / other dashboard JS throws.
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
        // Let the href handle navigation; only intercept if we need a confirm.
        // Default path: go straight to /admin/logout (full cleanup + redirect).
        e.preventDefault();
        try {
            if (typeof window.logout === 'function') {
                window.logout();
                return;
            }
        } catch (err) {
            console.error('Logout handler error:', err);
        }
        window.location.href = '/admin/logout';
    });
}

// =========================================================================
// SECTION 19: 🌟 ADMIN PROFILE PICTURE & AUTO-REFRESH MANAGEMENT SYSTEM 🌟
// =========================================================================

/**
 * ১. ডাটাবেজ থেকে অ্যাডমিন প্রোফাইল ছবি লোড করার ফাংশন
 * পেজ যখনই রিফ্রেশ বা নতুন করে লোড হবে, এই ফাংশনটি ডাটাবেজ থেকে লেটেস্ট ছবি এনে দেখাবে।
 */
function updateAdminProfileUI(adminData = {}) {
    const avatarImg = document.getElementById('adminProfilePic');
    const nameEl = document.querySelector('.admin-profile .info h4');
    const roleEl = document.querySelector('.admin-profile .info p');
    const displayName = adminData.name || adminData.username || 'Admin';
    const avatarUrl = adminData.image || adminData.avatar || adminData.avatarUrl || adminData.profileImage;

    if (nameEl) nameEl.textContent = displayName;
    if (roleEl) roleEl.textContent = adminData.role || 'Super Admin';

    if (!avatarImg) return;

    if (avatarUrl) {
        const bust = avatarUrl.includes('?') ? `${avatarUrl}&t=${Date.now()}` : `${avatarUrl}?t=${Date.now()}`;
        avatarImg.src = bust;
        avatarImg.style.display = 'block';
        avatarImg.onerror = () => {
            avatarImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=d97706&color=fff`;
        };
    } else {
        avatarImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=d97706&color=fff`;
    }
}

async function fetchAdminProfile() {
    try {
        
/* shared state: token lives on window (admin-core) */

        
        const response = await fetch('/api/admin/profile', {
            method: 'GET',
            headers: { 
                'Authorization': `Bearer ${token}` 
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            updateAdminProfileUI(data);
        }
    } catch (error) {
        console.error("🔴 The profile image could not be fetched from the database :", error);
    }
}

// পেজ রিফ্রেশ বা প্রথমবার লোড হওয়ার সাথে সাথে ছবি লোড করার ইভেন্ট অ্যাক্টিভ করা
document.addEventListener('DOMContentLoaded', fetchAdminProfile);

/**
 * ২. প্রোফাইল পিকচার ইনপুট চেঞ্জ এবং ক্লাউডিনারি আপলোড হ্যান্ডলার
 * ইনপুট ফিল্ডে নতুন ছবি সিলেক্ট করলেই তা সরাসরি ক্লাউডিনারি ও ডাটাবেজে সেভ হবে।
 */
const profileUploadInput = document.getElementById('profileUploadInput');

if (profileUploadInput && profileUploadInput.dataset.legacyBound !== '1') {
    profileUploadInput.dataset.legacyBound = '1';
    /* Handler attached in DOMContentLoaded via uploadAdminProfilePic — skip duplicate bind */
}

/*==========================================================================================================================*/

/*==========================================================================================================================*/

/* Expose module functions for HTML onclick + cross-module calls */
Object.assign(window, {
    setupSyncButton,
    updateAdminProfileUI,
    fetchAdminProfile
});
