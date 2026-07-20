/**
 * ==========================================================================
 * File Name: js/main.js
 * Project: eOnlineBazar
 * Author: Abdul Karim Sheikh
 * Description: Secure DOM-based Product Rendering & Dynamic Frontend Logic
 * ==========================================================================
 */

/* ==========================================================================
   SECTION 1: GLOBAL VARIABLES & INITIALIZATION (শুরু এবং ভেরিয়েবল)
   ========================================================================== */
let allProducts = [];

const HOME_BRANDING_DEFAULT_FAVICON = '/images/favicon.png';
const HOME_LEGACY_BRANDING_PREFIX = '/images/branding/';
const HOME_PUBLIC_BRANDING_PREFIX = '/uploads/branding/';

function normalizeHomeBrandingPath(url) {
    if (!url || typeof url !== 'string') return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    const withLeadingSlash = url.startsWith('/') ? url : `/${url}`;
    return withLeadingSlash.replace(
        new RegExp(`^${HOME_LEGACY_BRANDING_PREFIX}`),
        HOME_PUBLIC_BRANDING_PREFIX
    );
}

function cacheBustHomeBrandingPath(url) {
    const normalized = normalizeHomeBrandingPath(url);
    if (!normalized) return '';
    return `${normalized.split('?')[0]}?v=${Date.now()}`;
}

/**
 * Loads active store favicon + header logo for the home page from MongoDB settings.
 */
async function initHomeStoreBranding() {
    const faviconEl = document.getElementById('dynamic-favicon')
        || document.getElementById('siteFavicon');
    const logoBox = document.getElementById('home-brand-logo')
        || document.querySelector('header.amazon-header .logo-box');
    if (!faviconEl && !logoBox) return;

    try {
        const res = await fetch('/api/store/branding', { cache: 'no-store' });
        const json = await res.json();
        if (!json.success || !json.data) return;

        const settings = json.data;
        const faviconPath = settings.faviconPath || settings.faviconUrl;
        const logoPath = settings.logoPath || settings.logoUrl;
        const storeName = settings.storeName || 'EonlineBazar';

        if (faviconPath && faviconEl) {
            faviconEl.href = cacheBustHomeBrandingPath(faviconPath);
            faviconEl.type = faviconPath.endsWith('.ico') ? 'image/x-icon' : 'image/png';
        }

        if (logoPath && logoBox) {
            const img = document.createElement('img');
            img.src = cacheBustHomeBrandingPath(logoPath);
            img.alt = storeName;
            img.className = 'store-brand-logo';
            img.setAttribute('data-store-logo', '');
            logoBox.innerHTML = '';
            logoBox.appendChild(img);
            logoBox.classList.add('has-store-logo');
        }
    } catch (err) {
        console.warn('Home page branding load failed:', err);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initHomeStoreBranding();
    fetchAndRenderProducts();
});

/* ==========================================================================
   SECTION 2: FETCH PRODUCTS FROM API (ডাটাবেজ থেকে ডাটা আনা)
   ========================================================================== */
function fetchAndRenderProducts() {
    const productGrid = document.getElementById('productGrid');
    if (!productGrid) return;

    fetch('/api/products')
        .then(response => {
            if (!response.ok) throw new Error('Network response was not ok');
            return response.json();
        })
        .then(data => {
            // 🚀 আপডেট: ব্যাকএন্ড যদি { data: [...] } বা { products: [...] } হিসেবে ডাটা পাঠায়, সেটাও হ্যান্ডেল করবে
            allProducts = Array.isArray(data) ? data : (data.data || data.products || []); 
            
            if (allProducts.length === 0) {
                console.warn("No products found in the API response.");
            }

            displayProducts(allProducts);
            generateCategoryButtons();
        })
        .catch(error => {
            console.error('Error fetching products:', error);
            productGrid.innerHTML = `<p style="color: red; text-align: center; width: 100%;">Failed to load products.</p>`;
        });
}

/* ==========================================================================
   SECTION 3: RENDER PRODUCT CARDS (প্রোডাক্ট কার্ড এবং ইমেজ/ইমোজি লজিক)
   ========================================================================== */
function displayProducts(productsToDisplay) {
    const productGrid = document.getElementById('productGrid');
    if (!productGrid) return;

    productGrid.innerHTML = '';

    if (!Array.isArray(productsToDisplay) || productsToDisplay.length === 0) {
        productGrid.innerHTML = `<p style="text-align: center; width: 100%;">No products found.</p>`;
        return;
    }

    productsToDisplay.forEach(product => {
        const productCard = document.createElement('div');
        productCard.className = 'product-card';

        // 🚀 চূড়ান্ত ফিক্স: সব ধরনের আইডির নাম চেক করে সঠিক আইডি বের করা
        const productId = product._id || product.id || product.productId;

        // 🔗 লিংক তৈরি (প্রোডাক্ট ডিটেইলস পেজে যাওয়ার জন্য)
        const productLink = document.createElement('a');
        productLink.href = `/product-details.html?id=${productId}`; // ফাইলের আগে '/' দেওয়া হয়েছে যাতে পাথ ঠিক থাকে
        productLink.style.textDecoration = 'none';
        productLink.style.color = 'inherit';
        productLink.style.display = 'block';

        // 🚀 ইমেজ সোর্স চেক (product.products এর বদলে product.photo চেক করা হলো)
        let imageSource = product.image ? product.image.trim() : (product.photo ? product.photo.trim() : ''); 
        let iconData = product.icon ? product.icon.trim() : '';

        // 🖼️ ইমেজ বক্স তৈরি
        const imgBox = document.createElement('div');
        imgBox.className = 'product-img-box';

        // ব্যাকআপ ইমোজি বা টেক্সট দেখানোর ফাংশন
        const applyFallback = () => {
            imgBox.innerHTML = ''; 
            if (iconData !== '') {
                imgBox.innerHTML = `<div class="product-emoji-display" style="font-size: 40px; text-align: center; padding: 20px;">${iconData}</div>`;
            } else {
                imgBox.innerHTML = `<div class="no-photo-box" style="text-align: center; padding: 20px; color: #888;">NO PHOTO</div>`;
            }
        };

        // 📸 ইমেজ ভ্যালিডেশন
        let hasValidImage = false;
        if (imageSource !== '') {
            const lowerPath = imageSource.toLowerCase();
            if (lowerPath.includes('.jpg') || lowerPath.includes('.png') || lowerPath.includes('.jpeg') || lowerPath.includes('.webp') || lowerPath.includes('.heic')) {
                hasValidImage = true;
            }
        }

        if (hasValidImage) {
            let finalImagePath = imageSource;
            // পাথের শুরুতে সঠিক ফোল্ডার যুক্ত করা
            if (!finalImagePath.startsWith('/') && !finalImagePath.startsWith('http') && !finalImagePath.startsWith('products/') && !finalImagePath.startsWith('uploads/')) {
                finalImagePath = '/products/' + finalImagePath;
            } else if (finalImagePath.startsWith('products/') || finalImagePath.startsWith('uploads/')) {
                finalImagePath = '/' + finalImagePath;
            }

            const imgElement = document.createElement('img');
            imgElement.src = finalImagePath;
            imgElement.alt = product.name || 'Product Image';
            imgElement.className = 'product-img';
            
            // ছবি ভাঙা থাকলে বা লোড না হলে ইমোজি
            imgElement.onerror = function() {
                applyFallback(); 
            };

            imgBox.appendChild(imgElement);
        } else {
            // ডাটাবেজে কোনো ছবির নাম না থাকলে সরাসরি ইমোজি
            applyFallback(); 
        }

        // 📝 প্রোডাক্ট ইনফো বক্স
        const productInfo = document.createElement('div');
        productInfo.className = 'product-info';
        productInfo.innerHTML = `
            <h4 class="product-name">${product.name || 'Unknown Product'}</h4>
            <div class="product-price-row">
                <span class="currency">৳</span>
                <span class="price-amount">${product.price || '0'}</span>
            </div>
        `;

        // 🛒 Add to Cart বাটন
        const addToCartBtn = document.createElement('button');
        addToCartBtn.className = 'add-to-cart-btn';
        addToCartBtn.innerText = 'Add to Bag';

        addToCartBtn.addEventListener('click', (e) => {
            e.preventDefault();   // 👈 ডিফল্ট অ্যাকশন বন্ধ
            e.stopPropagation();  // 👈 কার্ডের লিংকে যাওয়া বন্ধ

            if (typeof window.addToBag === 'function') {
                window.addToBag(productId, product.name, product.price, imageSource);
            } else if (typeof addToBag === 'function') {
                addToBag(productId, product.name, product.price, imageSource);
            } else {
                alert("কার্ট ফাংশনটি খুঁজে পাওয়া যাচ্ছে না। পেজ রিলোড দিন।");
            }
        });

        // ডমে এলিমেন্টগুলো সাজানো
        productLink.appendChild(imgBox);
        productLink.appendChild(productInfo);
        productCard.appendChild(productLink);
        productCard.appendChild(addToCartBtn);
        
        productGrid.appendChild(productCard);
    });
}



/* ==========================================================================
   SECTION 4: DYNAMIC CATEGORY BUTTONS (ক্যাটাগরি বাটন লজিক)
   ========================================================================== */
function generateCategoryButtons() {
    const btnContainer = document.getElementById('categoryButtonContainer');
    if (!btnContainer) return;

    const categories = ['all', ...new Set(allProducts.map(p => p.category))];
    btnContainer.innerHTML = '';

    categories.forEach(category => {
        const button = document.createElement('button');
        button.className = 'nav-category-item' + (category === 'all' ? ' active' : '');
        
        // প্রথম অক্ষর বড় হাতের করা
        const formattedName = category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
        button.innerText = formattedName;
        
        button.addEventListener('click', () => {
            document.querySelectorAll('.nav-category-item').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            if (category === 'all') {
                displayProducts(allProducts);
            } else {
                const filtered = allProducts.filter(p => p.category === category);
                displayProducts(filtered);
            }
        });
        btnContainer.appendChild(button);
    });
}

/* ==========================================================================
   SECTION 5: SEARCH LOGIC (কিওয়ার্ড রাউটিং → /search পেজ)
   --------------------------------------------------------------------------
   হেডারের সার্চ বার এখন কাস্টমারকে ডেডিকেটেড /search?q=keyword পেজে পাঠায়
   (Daraz/Shopify স্টাইল)। টাইপ করার সময় 300ms ডিবাউন্স ব্যবহার করা হয় যাতে
   অপ্রয়োজনীয়ভাবে বারবার নেভিগেট/API হিট না হয়।
   ========================================================================== */

// একটি কিওয়ার্ড নিয়ে ক্লিন সার্চ পেজে রিডাইরেক্ট করার হেল্পার
function goToSearchPage(term) {
    const q = String(term || '').trim();
    if (q.length < 1) return;
    window.location.href = `/search?q=${encodeURIComponent(q)}`;
}

// Enter/বাটন ক্লিকে সাথে সাথে সার্চ পেজে যাওয়া
window.triggerSearch = function() {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;
    goToSearchPage(searchInput.value);
};

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;

    // 🌟 ডিবাউন্স (300ms): টাইপ থামলে তবেই সার্চ পেজে সিমলেসভাবে রিডাইরেক্ট
    let debounceTimer = null;
    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const term = searchInput.value.trim();
        // অন্তত ২ অক্ষর হলে অটো-নেভিগেট (অকালীন রিডাইরেক্ট এড়াতে)
        if (term.length < 2) return;
        debounceTimer = setTimeout(() => goToSearchPage(term), 300);
    });

    // Enter চাপলে ডিবাউন্স ছাড়াই তাৎক্ষণিক সার্চ
    searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            clearTimeout(debounceTimer);
            triggerSearch();
        }
    });
});

/* ==========================================================================
   SECTION 6: DYNAMIC FOOTER LOADER (ফুটার স্ক্রিপ্ট লোড করা)
   ========================================================================== */
document.addEventListener("DOMContentLoaded", () => {
    const script = document.createElement('script');
    script.src = 'js/footer.js'; 
    
    script.onload = () => {
        if (typeof window.initGlobalFooterEngine === "function") {
            window.initGlobalFooterEngine();
        }
    };

    document.body.appendChild(script);
});

/* ==========================================================================
   SECTION 7: NAVBAR/HEADER USER AUTHENTICATION SYNC (হেডারে ইউজার প্রোফাইল)
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    // ১. লোকাল স্টোরেজ থেকে কাস্টমার টোকেন ও নাম চেক করা
    const token = localStorage.getItem('customerToken');
    const userName = localStorage.getItem('userName');

    // ২. হেডারের নতুন DOM উপাদানগুলো সিলেক্ট করা
    const navUserLink = document.getElementById('nav-user-link');
    const navUserLine1 = document.getElementById('nav-user-line1');
    const navUserLine2 = document.getElementById('nav-user-line2');
    const navUserAvatar = document.getElementById('nav-user-avatar');

    // ৩. ইউজার যদি অলরেডি লগইন থাকে
    if (token) {
        // বাটনের ক্লিক ফাংশন পরিবর্তন করে 'profile.html' এ পাঠানো হচ্ছে
        if (navUserLink) {
            navUserLink.setAttribute('onclick', "window.location.href='/profile'");
            navUserLink.style.display = 'flex';       // ছবি ও লেখা পাশাপাশি সুন্দর দেখানোর জন্য
            navUserLink.style.alignItems = 'center';
            navUserLink.style.cursor = 'pointer';
        }

        // 'Sign in Account' এর জায়গায় নাম সেট করা
        if (navUserLine1) navUserLine1.textContent = 'Hello,';
        if (navUserLine2) navUserLine2.textContent = userName ? userName : 'My Account';

        // ৪. ডাটাবেজ থেকে ইউজারের প্রোফাইল পিকচার (Avatar) লোড করা
        fetchNavbarProfile(token, navUserAvatar);
    }
});

// প্রোফাইল পিকচার ব্যাকঅ্যান্ড থেকে নিয়ে আসার ফাংশন
async function fetchNavbarProfile(token, avatarElement) {
    try {
        const response = await fetch('/api/customer/profile', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();

        // যদি ব্যাকঅ্যান্ড থেকে ইমেজ সাকসেসফুলি আসে এবং এলিমেন্টটি থাকে
        if (response.ok && data.avatar && avatarElement) {
            avatarElement.src = data.avatar;   // ক্লাউডিনারি বা ডাটাবেজের ইউআরএল সেট
            avatarElement.style.display = 'block'; // ইমেজটি স্ক্রিনে শো করানো হলো
        }
    } catch (error) {
        console.error('Error fetching navbar profile data:', error);
    }
}




