//File Name: js/product-details.js



// ==========================================================================
// 🌟 SECTION 1: GLOBAL CONFIGURATIONS & INITIALIZATION
// ==========================================================================
const API_BASE_URL = '/api/products'; 
let currentProductData = null; // 👈 প্রোডাক্টের ডাটা গ্লোবালি ধরে রাখার জন্য নতুন ভেরিয়েবল

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');

    if (productId) {
        fetchProductDetails(productId);
    } else {
        showToast("Product ID missing in URL!", "error");
    }

    setupEventListeners();
    setupTabSystem();
});

// ==========================================================================
// 🌟 SECTION 2: FETCH & DISPLAY PRODUCT DATA
// ==========================================================================
async function fetchProductDetails(id) {
    const loadingSpinner = document.getElementById('productLoading');
    const productContent = document.getElementById('productContent');
    const extraSection = document.getElementById('productExtraSection');

    try {
        const response = await fetch(`${API_BASE_URL}/${id}`);
        if (!response.ok) throw new Error("Product not found");
        
        const product = await response.json();
        currentProductData = product; 

        renderBreadcrumb(product);
        renderProductInfo(product);
        renderProductImages(product);
        renderHighlights(product); 
        renderDescriptions(product);
        
        // 🟢 আপডেট: এখন আলাদা এপিআই থেকে রিভিউ কল হবে
        fetchProductReviews(id); 

        if (loadingSpinner) loadingSpinner.classList.add('hidden');
        if (productContent) productContent.classList.remove('hidden');
        if (extraSection) extraSection.classList.remove('hidden');

    } catch (error) {
        console.error("Error fetching product details:", error);
        showToast("Failed to load product details!", "error");
        if (loadingSpinner) {
            loadingSpinner.innerHTML = `<p style="color: #ef4444;"><i class="fa-solid fa-triangle-exclamation"></i> Error loading product!</p>`;
        }
    }
}



// ==========================================================================
// 🌟 SECTION 3: RENDER SUB-FUNCTIONS (INFO, IMAGES, BREADCRUMB, HIGHLIGHTS)
// ==========================================================================
function renderBreadcrumb(product) {
    const breadcrumbCategory = document.getElementById('breadcrumbCategory');
    const breadcrumbTitle = document.getElementById('breadcrumbTitle');

    if (breadcrumbCategory) breadcrumbCategory.innerText = product.category || 'General';
    if (breadcrumbTitle) breadcrumbTitle.innerText = product.name || 'Product';
}

function renderProductInfo(product) {
    const title = document.getElementById('productTitle');
    const category = document.getElementById('infoCategory');
    const price = document.getElementById('productPrice');
    const stockStatus = document.getElementById('stockStatus');
    
    // মোবাইল স্টিকি বার এলিমেন্ট
    const stickyTitle = document.getElementById('stickyBarTitle');
    const stickyPrice = document.getElementById('stickyBarPrice');

    if (title) title.innerText = product.name;
    if (stickyTitle) stickyTitle.innerText = product.name;
    if (category) category.innerText = product.category || 'General';
    if (price) price.innerText = `৳ ${product.price.toLocaleString()}`;
    if (stickyPrice) stickyPrice.innerText = `৳ ${product.price.toLocaleString()}`;

    if (stockStatus) {
        if (product.stock > 0) {
            stockStatus.innerText = "In Stock";
            stockStatus.style.color = "var(--success-green)";
        } else {
            stockStatus.innerText = "Out of Stock";
            stockStatus.style.color = "var(--accent-red)";
        }
    }
}

// 👈 নতুন ফাংশন: ডাটাবেজ থেকে হাইলাইটস অ্যারে রেন্ডার করার জন্য
function renderHighlights(product) {
    const highlightsContainer = document.getElementById('productHighlightsList'); 
    if (!highlightsContainer) return;

    if (product.highlights && product.highlights.length > 0) {
        // লক্ষ্য করুন: এখানে ব্যাকটিক (`) ব্যবহার করা হয়েছে, সিঙ্গেল কোট (') নয়!
        highlightsContainer.innerHTML = product.highlights
            .map(item => `<li><i class="fa-solid fa-circle-check" style="color: var(--success-green); margin-right: 5px;"></i> ${item}</li>`)
            .join('');
    } else {
        // যদি হাইলাইটস খালি থাকে
        highlightsContainer.innerHTML = `
            <li><i class="fa-solid fa-circle-check" style="color: var(--success-green); margin-right: 5px;"></i> 100% Original Product</li>
            <li><i class="fa-solid fa-circle-check" style="color: var(--success-green); margin-right: 5px;"></i> Best quality guaranteed</li>
        `;
    }
}

function renderProductImages(product) {
    const mainImg = document.getElementById('mainProductImg');
    const stickyImg = document.getElementById('stickyBarImg');
    const gallery = document.getElementById('thumbGallery');

    const mainImageUrl = product.image || 'images/placeholder.jpg';

    if (mainImg) mainImg.src = mainImageUrl;
    if (stickyImg) stickyImg.src = mainImageUrl;

    if (gallery) {
        gallery.innerHTML = ''; // পুরোনো থাম্বনেইল ক্লিয়ার করা
        
        // যদি গ্যালারি ইমেজ অ্যারে থাকে তবে লুপ চলবে, না থাকলে শুধু মেইন ইমেজ দেখাবে
        const imagesArray = product.images && product.images.length > 0 ? product.images : [mainImageUrl];
        
        imagesArray.forEach((imgUrl, index) => {
            const imgBtn = document.createElement('img');
            imgBtn.src = imgUrl;
            imgBtn.classList.add('thumb-img');
            if (index === 0) imgBtn.classList.add('active');

            imgBtn.addEventListener('click', () => {
                document.querySelectorAll('.thumb-img').forEach(t => t.classList.remove('active'));
                imgBtn.classList.add('active');
                if (mainImg) mainImg.src = imgUrl;
            });

            gallery.appendChild(imgBtn);
        });
    }
}


// ==========================================================================
// 🌟 SECTION 4: DYNAMIC SHORT & DETAILED DESCRIPTION LOGIC
// ==========================================================================
function renderDescriptions(product) {
    const shortDescElement = document.getElementById('productShortDesc');
    const detailedDescElement = document.getElementById('productDetailedDesc');

    // ফিউচার প্রুফ লজিক: নতুন ফিল্ড চেক করবে, না থাকলে মেইন description ফিল্ড নিবে
    const shortDescText = product.shortDescription || product.description;
    const detailedDescText = product.detailedDescription || product.description;

    if (shortDescElement) {
        shortDescElement.innerText = (shortDescText && shortDescText.trim() !== "") 
            ? shortDescText 
            : "No short description available.";
    }

    if (detailedDescElement) {
        detailedDescElement.innerHTML = (detailedDescText && detailedDescText.trim() !== "") 
            ? detailedDescText 
            : "No detailed description available.";
    }
}

// ==========================================================================
// 🌟 SECTION 5: REVIEWS MANAGEMENT
// ==========================================================================
function renderReviews(reviews) {
    const container = document.getElementById('reviewsListContainer');
    const tabCount = document.getElementById('tabReviewCount');
    const summaryCount = document.getElementById('productReviewCount');

    if (tabCount) tabCount.innerText = reviews.length;
    if (summaryCount) summaryCount.innerText = `(${reviews.length} Customer Reviews)`;

    if (!container) return;

    if (reviews.length === 0) {
        container.innerHTML = `
            <p class="no-reviews-msg">
                <i class="fa-solid fa-comment-slash"></i> No reviews yet. Be the first to review this product!
            </p>`;
        return;
    }

    container.innerHTML = '';
    reviews.forEach(rev => {
        const revCard = document.createElement('div');
        revCard.classList.add('review-card'); 
        
        let starsHTML = '';
        for (let i = 1; i <= 5; i++) {
            starsHTML += i <= rev.rating ? `<i class="fa-solid fa-star" style="color: #facc15;"></i>` : `<i class="fa-regular fa-star" style="color: #d1d5db;"></i>`;
        }

        // 🟢 ডাটাবেস থেকে ইউজারের নাম বের করার লজিক
        const reviewerName = rev.userId?.name || rev.name || "Verified Customer";

        revCard.innerHTML = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                <strong>${reviewerName}</strong>
                <div>${starsHTML}</div>
            </div>
            <p style="margin: 0; font-size: 14px; color: var(--text-main);">${rev.comment}</p>
            ${rev.photo ? `<div style="margin-top: 10px;"><img src="${rev.photo}" alt="Review Photo" style="width: 80px; height: 80px; object-fit: cover; border-radius: 5px; border: 1px solid #ddd;"></div>` : ''}
            <hr style="border: 0; border-top: 1px solid var(--border-color); margin: 10px 0;">
        `;
        container.appendChild(revCard);
    });
}

// ==========================================================================
// 🌟 SECTION 6: QUANTITY CONTROLS & INTERACTIONS
// ==========================================================================
function setupEventListeners() {
    const qtyInput = document.getElementById('productQtyInput');
    const decreaseBtn = document.getElementById('decreaseQtyBtn');
    const increaseBtn = document.getElementById('increaseQtyBtn');
    
    const addToCartBtn = document.getElementById('addToCartBtn');
    const buyNowBtn = document.getElementById('buyNowBtn');
    const stickyAddToCartBtn = document.getElementById('stickyAddToCartBtn');
    const stickyBuyNowBtn = document.getElementById('stickyBuyNowBtn');

    if (increaseBtn && qtyInput) {
        increaseBtn.addEventListener('click', () => {
            qtyInput.value = parseInt(qtyInput.value) + 1;
        });
    }

    if (decreaseBtn && qtyInput) {
        decreaseBtn.addEventListener('click', () => {
            if (parseInt(qtyInput.value) > 1) {
                qtyInput.value = parseInt(qtyInput.value) - 1;
            }
        });
    }

    // 👈 Add to Cart লজিক (আগের মতোই থাকবে, সাধারণ কার্টে অ্যাড করবে)
    const handleAddToCart = () => {
        if (!currentProductData) return showToast("Please wait, product data is loading...", "error");

        const quantity = qtyInput ? parseInt(qtyInput.value) || 1 : 1;
        let cart = JSON.parse(localStorage.getItem('cart')) || []; 

        const prodId = currentProductData._id || currentProductData.productId || currentProductData.id;
        const existingItemIndex = cart.findIndex(item => item.id === prodId);

        if (existingItemIndex > -1) {
            let existingItem = cart.splice(existingItemIndex, 1)[0]; 
            existingItem.quantity += quantity; 
            cart.unshift(existingItem); 
        } else {
            cart.unshift({
                id: prodId,
                name: currentProductData.name,
                price: currentProductData.price,
                icon: currentProductData.icon || currentProductData.image || '📦',
                quantity: quantity,
                selected: true
            });
        }

        localStorage.setItem('cart', JSON.stringify(cart));
        showToast("Product added to cart successfully! 🛒", "success");
    };
    

    // 👈 রিয়েল Buy Now লজিক (সাধারণ কার্টে হাত না দিয়ে আইসোলেটেড মোডে চেকআউটে পাঠাবে)
    const handleBuyNow = () => {
        if (!currentProductData) return showToast("Please wait, product data is loading...", "error");

        const quantity = qtyInput ? parseInt(qtyInput.value) || 1 : 1;
        const prodId = currentProductData._id || currentProductData.productId || currentProductData.id;

        // Buy Now এর জন্য শুধু এই একটি প্রোডাক্ট দিয়ে একটি নতুন অ্যারে তৈরি
        const buyNowItem = [{
            id: prodId,
            name: currentProductData.name,
            price: currentProductData.price,
            icon: currentProductData.icon || currentProductData.image || '📦',
            quantity: quantity,
            selected: true
        }];

        // কার্টকে না ছুঁয়ে সম্পূর্ণ ভিন্ন একটি স্টোরেজ বাক্সে রাখা হচ্ছে
        localStorage.setItem('isBuyNowMode', 'true');
        localStorage.setItem('buy_now_item', JSON.stringify(buyNowItem));
        localStorage.setItem("activeCheckoutSession", "true");

        showToast("Proceeding to checkout...", "success");
        
        setTimeout(() => {
            window.location.href = '/checkout'; 
        }, 500); 
    };

    // বাটনগুলোর সাথে ফাংশন জুড়ে দেওয়া
    if (addToCartBtn) addToCartBtn.addEventListener('click', handleAddToCart);
    if (stickyAddToCartBtn) stickyAddToCartBtn.addEventListener('click', handleAddToCart);
    if (buyNowBtn) buyNowBtn.addEventListener('click', handleBuyNow);
    if (stickyBuyNowBtn) stickyBuyNowBtn.addEventListener('click', handleBuyNow);

    // মোবাইল স্টিকি বার স্ক্রোল ইফেক্ট
    window.addEventListener('scroll', () => {
        const mobileStickyBar = document.getElementById('mobileStickyBar');
        if (mobileStickyBar) {
            if (window.scrollY > 300) {
                mobileStickyBar.classList.remove('hidden');
            } else {
                mobileStickyBar.classList.add('hidden');
            }
        }
    });
}

// ==========================================================================
// 🌟 SECTION 7: MODERN TABS CONTROLLER
// ==========================================================================
function setupTabSystem() {
    const tabs = document.querySelectorAll('.tab-trigger');
    const panes = document.querySelectorAll('.tab-content-pane');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            panes.forEach(p => p.classList.remove('active'));

            tab.classList.add('active');
            const targetPane = document.getElementById(tab.dataset.tab);
            if (targetPane) targetPane.classList.add('active');
        });
    });
}

// ==========================================================================
// 🌟 SECTION 8: CUSTOM TOAST NOTIFICATION (WITH CLOSE BUTTON)
// ==========================================================================
function showToast(message, type = "success") {
    const oldToast = document.getElementById('custom-toast');
    if (oldToast) oldToast.remove();

    const toast = document.createElement('div');
    toast.id = 'custom-toast';
    
    // মিক্সড সিএসএস রিমুভ করে জাভাস্ক্রিপ্ট অবজেক্ট স্টাইল দেওয়া হলো
    toast.style.cssText = `
        position: fixed; bottom: 30px; right: 30px; padding: 15px 20px;
        background: ${type === 'success' ? '#111827' : '#ef4444'};
        color: #fff; font-family: sans-serif; font-size: 15px; font-weight: 500;
        border-radius: 8px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.3);
        z-index: 9999; transform: translateY(100px); opacity: 0; transition: all 0.4s ease;
        display: flex; align-items: center; justify-content: space-between; gap: 20px;
        min-width: 300px;
    `;
    
    toast.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 18px;">${type === 'success' ? '✅' : '⚠️'}</span>
            <span>${message}</span>
        </div>
        <span class="btn-close-toast" style="cursor: pointer; font-size: 24px; line-height: 1; opacity: 0.7; transition: 0.2s;">&times;</span>
    `;
    
    document.body.appendChild(toast);

    setTimeout(() => { 
        toast.style.transform = 'translateY(0)'; 
        toast.style.opacity = '1'; 
    }, 50);

    const closeBtn = toast.querySelector('.btn-close-toast');
    closeBtn.addEventListener('mouseenter', () => closeBtn.style.opacity = '1');
    closeBtn.addEventListener('mouseleave', () => closeBtn.style.opacity = '0.7');
    
    const dismissToast = () => {
        toast.style.transform = 'translateY(100px)';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 400);
    };
    
    closeBtn.addEventListener('click', dismissToast);

    setTimeout(() => {
        if (document.body.contains(toast)) dismissToast();
    }, 4000);
}




// ==========================================================================
// 🌟 SECTION 9: FETCH PRODUCT REVIEWS (NEW)
// ==========================================================================
async function fetchProductReviews(productId) {
    try {
        const response = await fetch(`/api/reviews/${productId}`);
        const data = await response.json();
        
        if (data.success && data.reviews) {
            renderReviews(data.reviews);
        } else {
            renderReviews([]);
        }
    } catch (error) {
        console.error("Error fetching reviews from database:", error);
        renderReviews([]); // এরর হলে খালি দেখাবে
    }
}




// ==========================================================================
// 🌟 SECTION 10: REVISED REVIEW MODAL & EDIT LOGIC (আপডেটেড)
// ==========================================================================
async function openReviewModal(productId) {
    try {
        const response = await fetch(`/api/reviews/${productId}`);
        const data = await response.json();
        
        // এখানে 'userInfo' এর বদলে আপনার আসল কী (Key) ব্যবহার করুন
        const userInfo = JSON.parse(localStorage.getItem('userInfo')) || null; 
        if (!userInfo) return showToast("Please login first!", "error");

        const currentUserId = userInfo._id || userInfo.id; 
        
        if (data.success && data.reviews) {
            const myReview = data.reviews.find(r => 
                (r.userId && r.userId._id === currentUserId) || (r.userId === currentUserId)
            );
            
            if (myReview) {
                // ফর্মের ইনপুট আইডিগুলো আপনার HTML এর সাথে মিলিয়ে নিন
                document.getElementById('reviewComment').value = myReview.comment;
                document.getElementById('reviewRating').value = myReview.rating;

                // যদি আগের আপলোড করা ফটো দেখাতে চান
                if (myReview.photo) {
                    const previewImg = document.getElementById('reviewPhotoPreview'); // আপনার HTML এ একটি ইমেজ ট্যাগ থাকতে হবে
                    if (previewImg) {
                        previewImg.src = myReview.photo;
                        previewImg.style.display = 'block';
                    }
                }
                showToast("Previous review loaded for editing!", "success");
            }
        }
    } catch (err) {
        console.error("Error loading review:", err);
    }
}





