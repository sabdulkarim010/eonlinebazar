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

document.addEventListener('DOMContentLoaded', () => {
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
        .then(products => {
            allProducts = products; 
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

    if (productsToDisplay.length === 0) {
        productGrid.innerHTML = `<p style="text-align: center; width: 100%;">No products found.</p>`;
        return;
    }

    productsToDisplay.forEach(product => {
        const productCard = document.createElement('div');
        productCard.className = 'product-card';

        // 🔗 লিংক তৈরি (প্রোডাক্ট ডিটেইলস পেজে যাওয়ার জন্য)
        const productLink = document.createElement('a');
        productLink.href = `product-details.html?id=${product.id || product._id}`;
        productLink.style.textDecoration = 'none';
        productLink.style.color = 'inherit';
        productLink.style.display = 'block';

        // 🚀 চূড়ান্ত ফিক্স: image এবং products উভয় ফিল্ডেই ছবি খুঁজবে
        let imageSource = product.image ? product.image.trim() : (product.products ? product.products.trim() : ''); 
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

        // 📸 ইমেজ ভ্যালিডেশন (বড় হাতের বা ছোট হাতের যাই হোক না কেন, সে ধরে ফেলবে)
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
            imgElement.alt = product.name;
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
            <h4 class="product-name">${product.name}</h4>
            <div class="product-price-row">
                <span class="currency">৳</span>
                <span class="price-amount">${product.price}</span>
            </div>
        `;

        // 🛒 Add to Cart বাটন
        const addToCartBtn = document.createElement('button');
        addToCartBtn.className = 'add-to-cart-btn';
        addToCartBtn.innerText = 'Add to Bag';

        addToCartBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // বাটনে ক্লিক করলে ডিটেইলস পেজে যাবে না
            if (typeof window.addToBag === 'function') {
                window.addToBag(product.id || product._id, product.name, product.price, imageSource);
            } else if (typeof addToBag === 'function') {
                addToBag(product.id || product._id, product.name, product.price, imageSource);
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
   SECTION 5: SEARCH & FILTER LOGIC (সার্চ এবং কিবোর্ড ইভেন্ট)
   ========================================================================== */
window.triggerSearch = function() {
    const searchInput = document.getElementById('searchInput');
    const selectedCategory = document.getElementById('categorySelect');
    
    if (!searchInput || !selectedCategory) return;

    const searchTerm = searchInput.value.toLowerCase().trim();
    const categoryVal = selectedCategory.value;

    let filtered = allProducts;

    if (categoryVal !== 'all') {
        filtered = filtered.filter(p => p.category === categoryVal);
    }
    if (searchTerm !== '') {
        filtered = filtered.filter(p => p.name.toLowerCase().includes(searchTerm));
    }
    displayProducts(filtered);
}

// কিবোর্ডের Enter চাপলে অটোমেটিক সার্চ
document.addEventListener("keydown", function(event) {
    if (event.key === "Enter") {
        if (document.activeElement && document.activeElement.id === "searchInput") {
            event.preventDefault(); 
            triggerSearch(); 
        }
    }
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




