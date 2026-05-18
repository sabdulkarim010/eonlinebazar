/**
 * File Name: js/main.js
 * Project: eOnlineBazar
 * Author: Abdul Karim Sheikh
 * Description: Secure DOM-based Product Rendering with Strict Fallback
 * Priority: 1. Real Image -> 2. Emoji Icon -> 3. NO PHOTO Text
 */

document.addEventListener('DOMContentLoaded', () => {
    fetchAndRenderProducts();
});

let allProducts = [];

// ১. json ফাইল থেকে ডেটা নিয়ে আসা
function fetchAndRenderProducts() {
    const productGrid = document.getElementById('productGrid');
    if (!productGrid) return;

    fetch('product.json')
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

/**
 * --- ২. প্রোডাক্ট কার্ড রেন্ডার করার সম্পূর্ণ ও চূড়ান্ত ফাংশন ---
 */
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

        let assetData = product.products ? product.products.trim() : ''; 
        let iconData = product.icon ? product.icon.trim() : '';

        // ইমেজ বক্স তৈরি করা
        const imgBox = document.createElement('div');
        imgBox.className = 'product-img-box';
       // after delete imgBox.style.cssText = 'height: 180px; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #fafafa; margin-bottom: 10px;';

        // ব্যাকআপ কন্টেন্ট (১ম অগ্রাধিকার: icon এর ইমোজি, ২য় অগ্রাধিকার: products এর ইমোজি, ৩য় অগ্রাধিকার: NO PHOTO)
        const applyFallback = () => {
            imgBox.innerHTML = ''; 
            if (iconData !== '') {
                imgBox.innerHTML = `<div class="product-emoji-display">${iconData}</div>`;
            } else if (assetData !== '' && !assetData.includes('.')) {
                imgBox.innerHTML = `<div class="product-emoji-display">${assetData}</div>`;
            } else {
                imgBox.innerHTML = `<div class="no-photo-box">NO PHOTO</div>`;
            }
        };

        // চেক করা: products ফিল্ডে ফাইলের নাম (.jpg, .png ইত্যাদি) আছে কিনা
        if (assetData.endsWith('.jpg') || assetData.endsWith('.png') || assetData.endsWith('.jpeg') || assetData.endsWith('.webp')) {
            let imagePath = assetData;
            if (!imagePath.startsWith('products/') && !imagePath.startsWith('images/')) {
                imagePath = 'products/' + imagePath;
            }

            const imgElement = document.createElement('img');
            imgElement.src = imagePath;
            imgElement.alt = product.name;
           //after delete imgElement.style.cssText = 'max-width: 100%; max-height: 100%; object-fit: contain;';
            
            // ছবি লোড হতে ব্যর্থ হলে ব্যাকআপ ইমোজি বসবে
            imgElement.onerror = function() {
                applyFallback();
            };

            imgBox.appendChild(imgElement);
        } else {
            applyFallback();
        }

        // প্রোডাক্ট ইনফো বক্স তৈরি করা
        const productInfo = document.createElement('div');
        productInfo.className = 'product-info';
        productInfo.innerHTML = `
            <h4 class="product-name">${product.name}</h4>
            <div class="product-price-row">
                <span class="currency">৳</span>
                <span class="price-amount">${product.price}</span>
            </div>
        `;

        // বাটন এলিমেন্ট ডম (DOM) নিয়মে তৈরি (যাতে সিঙ্গেল/ডাবল কোটের কোনো ঝামেলা না হয়)
        const addToCartBtn = document.createElement('button');
        addToCartBtn.className = 'add-to-cart-btn';
        addToCartBtn.innerText = 'Add to Bag';

        // ক্লিক ইভেন্ট লিসেনার (আগে-পরে যেখানেই স্ক্রিপ্ট লিংক থাকুক, এটি ফেইল করবে না)
        addToCartBtn.addEventListener('click', () => {
            if (typeof window.addToBag === 'function') {
                window.addToBag(product.id, product.name, product.price, assetData);
            } else if (typeof addToBag === 'function') {
                addToBag(product.id, product.name, product.price, assetData);
            } else {
                console.error("addToBag function is not defined in cart.js!");
                alert("কার্ট ফাংশনটি খুঁজে পাওয়া যাচ্ছে না। অনুগ্রহ করে পেজটি আবার রিফ্রেশ করুন।");
            }
        });

        // বাটনটি ইনফো বক্সে এবং ইনফো বক্সটি মেইন কার্ডে অ্যাপেন্ড করা
        productInfo.appendChild(addToCartBtn);
        productCard.appendChild(imgBox);
        productCard.appendChild(productInfo);
        productGrid.appendChild(productCard);
    });
}

// ৩. ডাইনামিক ক্যাটাগরি বাটন তৈরি করা
// ৩. ডাইনামিক ক্যাটাগরি বাটন তৈরি করা (Case and Style Controlled)
function generateCategoryButtons() {
    const btnContainer = document.getElementById('categoryButtonContainer');
    if (!btnContainer) return;

    const categories = ['all', ...new Set(allProducts.map(p => p.category))];
    btnContainer.innerHTML = '';

    categories.forEach(category => {
        const button = document.createElement('button');
        
        button.className = 'nav-category-item' + (category === 'all' ? ' active' : '');
        
        // 🎯 ফিক্স ১: লেখাগুলোকে ২য় ছবির মতো করার জন্য প্রথম অক্ষর বড় হাতের আর বাকিগুলো ছোট হাতের করা হলো
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

// ৪. হেডার সার্চ ফিল্টার লজিক
function triggerSearch() {
    const searchInput = document.getElementById('searchInput').value.toLowerCase().trim();
    const selectedCategory = document.getElementById('categorySelect').value;

    let filtered = allProducts;

    if (selectedCategory !== 'all') {
        filtered = filtered.filter(p => p.category === selectedCategory);
    }
    if (searchInput !== '') {
        filtered = filtered.filter(p => p.name.toLowerCase().includes(searchInput));
    }
    displayProducts(filtered);
}

// 🎯 কিবোর্ডের Enter বাটন চাপলে স্বয়ংক্রিয়ভাবে সার্চ করার লজিক (১০০% নিরাপদ ও টেস্টেড)
document.addEventListener("keydown", function(event) {
    if (event.key === "Enter") {
        // মাউস কার্সার যদি সার্চ বক্সের ভেতরে থাকে, শুধু তখনই সার্চ ট্রিগার হবে
        if (document.activeElement && document.activeElement.id === "searchInput") {
            event.preventDefault(); // পেজ রিফ্রেশ হওয়া বন্ধ করবে
            triggerSearch();        /* আপনার মূল সার্চ ফাংশনটিকে সরাসরি কল করবে */
        }
    }
});

// আপনার main.js ফাইলের আগের অন্য সব কোড ওপরে থাকবে...

document.addEventListener("DOMContentLoaded", () => {
    // 🌍 ১. প্রথমে footer.js ফাইলটিকে ডাইনামিকালি পেজে যুক্ত করা হচ্ছে
    const script = document.createElement('script');
    script.src = 'js/footer.js'; // আপনার ফোল্ডার স্ট্রাকচার অনুযায়ী পাথ ঠিক রাখুন
    
    // ২. footer.js ফাইলটি পুরোপুরি লোড হওয়ার পর ফাংশনটি রান হবে
    script.onload = () => {
        if (typeof window.initGlobalFooterEngine === "function") {
            window.initGlobalFooterEngine();
        }
    };

    // ৩. স্ক্রিপ্টটিকে ডকুমেন্টের হেডে পুশ করা হলো
    document.body.appendChild(script);
});

