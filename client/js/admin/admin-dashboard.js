/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/admin-dashboard.js
 * Description: Analytics widgets, revenue charts, and dashboard metrics.
 */

import './admin-core.js';

/* ==========================================================================
   SECTION 5: OVERVIEW & ANALYTICS (ড্যাশবোর্ড ওভারভিউ এবং স্ট্যাটিস্টিকস)
   ========================================================================== */

/**
 * ৫.১: ড্যাশবোর্ডে বর্তমান তারিখ প্রদর্শন
 */
function updateDashboardDate(dateObj) {
    const textEl = document.getElementById('dateText');
    const d = dateObj instanceof Date && !isNaN(dateObj) ? dateObj : new Date();
    if (textEl) {
        const options = { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' };
        textEl.textContent = d.toLocaleDateString('en-US', options);
    }
}

/**
 * ৫.১ক: রিয়েল-টাইম লাইভ ঘড়ি (সেকেন্ড সহ) তারিখের ঠিক নিচে দেখানো
 */

/* shared state: __liveClockTimer lives on window (admin-core) */

function startLiveClock() {
    const clockEl = document.getElementById('clockText');
    if (!clockEl) return;

    const tick = () => {
        const now = new Date();
        clockEl.textContent = now.toLocaleTimeString('en-US', {
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
            timeZone: adminPlatformTimezone || undefined
        });
    };

    tick();
    if (__liveClockTimer) clearInterval(__liveClockTimer);
    __liveClockTimer = setInterval(tick, 1000);
}

/**
 * ৫.১খ: হেডারের তারিখ ক্লিক করলে ক্যালেন্ডার পিকার খোলা, এবং তারিখ
 * নির্বাচন করলে তা হেডারে প্রদর্শন করা।
 */
function setupHeaderDatePicker() {
    const dateBtn = document.getElementById('current-date');
    const picker = document.getElementById('hiddenDatePicker');
    if (!dateBtn || !picker) return;

    // আজকের তারিখ পিকারে প্রি-ফিল করা
    const today = new Date();
    picker.value = today.toISOString().slice(0, 10);

    dateBtn.addEventListener('click', () => {
        // আধুনিক ব্রাউজারে নেটিভ ক্যালেন্ডার পপআপ খোলা; না পারলে ফোকাস ফলব্যাক
        if (typeof picker.showPicker === 'function') {
            try { picker.showPicker(); return; } catch (_) { /* fallback below */ }
        }
        picker.focus();
        picker.click();
    });

    picker.addEventListener('change', () => {
        if (picker.value) {
            updateDashboardDate(new Date(picker.value + 'T00:00:00'));
        }
    });
}

/**
 * ৫.২: সার্ভার থেকে ড্যাশবোর্ডের প্রাথমিক ডাটা (কাস্টমার ও স্ট্যাটস) নিয়ে আসা
 * Overview পেজ এবং All Customers পেজ উভয়ের জন্যই এই ফাংশনটি কাজ করবে
 */
async function fetchDashboardData() {
    try {
        // 🛡️ রিকোয়েস্টে অ্যাডমিন সিকিউরিটি টোকেন পাঠানো হচ্ছে
        const response = await fetch('/api/admin/customers', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 429) {
            if (trackAdminPollError('dashboard', response)) return;
            showCustomerError('Too many requests. Please wait a moment and try again.');
            return;
        }
        if (response.status === 401) {
            handleAdminApiAuthResponse(response, {});
            return;
        }
        if (response.status === 403) {
            handleAdminApiAuthResponse(response, {});
            return;
        }

        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        
        const data = await response.json();
        resetAdminPollErrors('dashboard');
        
        // ব্যাকএন্ড রেসপন্সের বিভিন্ন ফরম্যাট হ্যান্ডেল করা
        if (data && data.success) {
            allCustomers = data.customers || data.data || [];
            customerSegmentThresholds = data.segmentThresholds || customerSegmentThresholds;
        } else if (Array.isArray(data)) {
            allCustomers = data;
        } else {
            allCustomers = [];
            showCustomerError("Failed to fetch data.");
        }

        // ডাটা পাওয়ার পর ড্যাশবোর্ডের কার্ড, চার্ট ও টেবিল আপডেট করা
        updateMetricsCards(allCustomers);
        const customersVisible = document.getElementById('view-customers')?.style.display !== 'none';
        if (customersVisible) {
            if (customerPg) customerPg.stayOnPage();
            else fetchCustomers(1, 10);
        }
        renderGrowthChart(allCustomers);
        await fetchDashboardAnalytics();

    } catch (error) {
        console.error("Dashboard Fetch Error:", error);
        showCustomerError("Server connection error.");
    }
}

/**
 * ৫.২ক: Sales & Order Analytics — revenue, order counts, charts & stock alerts
 */
async function fetchDashboardAnalytics() {
    try {
        const response = await fetch('/api/admin/dashboard-analytics', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 429) {
            if (trackAdminPollError('dashboardAnalytics', response)) return;
            console.warn('Dashboard analytics rate-limited — skipping auto-retry.');
            return;
        }
        if (response.status === 401) {
            handleAdminApiAuthResponse(response, {});
            return;
        }
        if (response.status === 403) {
            handleAdminApiAuthResponse(response, {});
            return;
        }

        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);

        const data = await response.json();
        resetAdminPollErrors('dashboardAnalytics');
        if (!data.success || !data.analytics) return;

        dashboardAnalytics = data.analytics;
        updateSalesMetricsCards(dashboardAnalytics);
        renderSalesTrendChart(dashboardAnalytics.salesTrend);
        renderTopProductsChart(dashboardAnalytics.topProducts);
        renderInventoryAlerts(dashboardAnalytics.inventoryAlerts);
    } catch (error) {
        console.error('Dashboard Analytics Fetch Error:', error);
    }
}

function updateSalesMetricsCards(analytics) {
    if (!analytics) return;

    const { revenue, orderCounts, totalCustomers } = analytics;

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    setText('stat-alltime-revenue', formatAdminPrice(revenue?.allTime || 0));
    setText('stat-revenue-breakdown', `Today: ${formatAdminPrice(revenue?.daily || 0)} · This Month: ${formatAdminPrice(revenue?.monthly || 0)}`);
    setText('stat-pending-orders', orderCounts?.pending ?? 0);
    setText('stat-return-requests', orderCounts?.returnRequests ?? 0);
    setText('stat-total-customers', totalCustomers ?? 0);
    setText('stat-total-orders', orderCounts?.total ?? 0);
    setText('stat-processing-orders', orderCounts?.processing ?? 0);
    setText('stat-delivered-orders', orderCounts?.delivered ?? 0);
}

function renderSalesTrendChart(salesTrend) {
    const ctx = document.getElementById('salesTrendChart');
    if (!ctx || typeof Chart === 'undefined' || !salesTrend) return;

    if (salesTrendChartInstance) salesTrendChartInstance.destroy();

    const series = salesTrendPeriod === 'monthly' ? salesTrend.monthly : salesTrend.daily;
    const labels = series?.labels || [];
    const values = series?.revenue || [];

    salesTrendChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Revenue',
                data: values,
                borderColor: '#8b5cf6',
                backgroundColor: 'rgba(139, 92, 246, 0.12)',
                borderWidth: 2.5,
                tension: 0.35,
                fill: true,
                pointRadius: 3,
                pointHoverRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => ` Revenue: ${formatAdminPrice(context.parsed.y)}`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: (value) => formatAdminPrice(value)
                    }
                },
                x: { grid: { display: false } }
            }
        }
    });
}

function renderTopProductsChart(topProducts) {
    const ctx = document.getElementById('topProductsChart');
    if (!ctx || typeof Chart === 'undefined') return;

    if (topProductsChartInstance) topProductsChartInstance.destroy();

    const products = topProducts || [];
    const labels = products.map((p) => p.name || 'Unknown');
    const quantities = products.map((p) => p.quantity || 0);
    const palette = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

    if (topProductsChartType === 'pie') {
        topProductsChartInstance = new Chart(ctx, {
            type: 'pie',
            data: {
                labels,
                datasets: [{
                    data: quantities,
                    backgroundColor: palette,
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' },
                    tooltip: {
                        callbacks: {
                            label: (context) => ` ${context.label}: ${context.parsed} units sold`
                        }
                    }
                }
            }
        });
        return;
    }

    topProductsChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Units Sold',
                data: quantities,
                backgroundColor: palette,
                borderRadius: 6,
                borderSkipped: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => ` ${context.parsed.y} units sold`
                    }
                }
            },
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } },
                x: { grid: { display: false } }
            }
        }
    });
}

function renderInventoryAlerts(inventoryAlerts) {
    const container = document.getElementById('inventoryAlertsList');
    const countLabel = document.getElementById('inventoryAlertCount');
    if (!container) return;

    const outOfStock = inventoryAlerts?.outOfStock || [];
    const lowStock = inventoryAlerts?.lowStock || [];
    const allAlerts = [
        ...outOfStock.map((p) => ({ ...p, alertType: 'out' })),
        ...lowStock.map((p) => ({ ...p, alertType: 'low' }))
    ];

    if (countLabel) {
        countLabel.textContent = allAlerts.length === 0
            ? 'All clear'
            : `${allAlerts.length} alert${allAlerts.length === 1 ? '' : 's'}`;
    }

    if (allAlerts.length === 0) {
        container.innerHTML = `
            <div class="inventory-alert-empty">
                <i class="fa-solid fa-circle-check"></i>
                <p>All products are well stocked.</p>
            </div>`;
        return;
    }

    container.innerHTML = allAlerts.map((product) => {
        const isOut = product.alertType === 'out';
        const badgeClass = isOut ? 'out' : 'low';
        const badgeText = isOut
            ? '⚠️ Out of Stock'
            : `🔥 Low Stock: ${product.stock} left`;
        const itemClass = isOut ? 'out-of-stock' : 'low-stock';
        const thumb = product.image
            ? `<img src="${product.image}" class="inventory-alert-thumb" alt="" onerror="this.outerHTML='<span class=\\'inventory-alert-thumb\\'>${product.icon || '📦'}</span>'">`
            : `<span class="inventory-alert-thumb">${product.icon || '📦'}</span>`;

        return `
            <div class="inventory-alert-item ${itemClass}">
                <div class="inventory-alert-info">
                    ${thumb}
                    <div class="inventory-alert-meta">
                        <strong>${product.name || 'Unnamed Product'}</strong>
                        <span>${product.productId || 'N/A'} · ${product.category || 'General'}</span>
                    </div>
                </div>
                <div class="inventory-alert-actions">
                    <span class="inventory-alert-badge ${badgeClass}">${badgeText}</span>
                    <button type="button" class="btn-update-stock" onclick="quickUpdateStock('${product._id}')">
                        <i class="fa-solid fa-pen"></i> Update Stock
                    </button>
                </div>
            </div>`;
    }).join('');
}

window.quickUpdateStock = async function(productId) {
    let product = globalProducts.find((p) => String(p._id) === String(productId));
    if (!product) {
        await fetchLiveProducts();
        product = globalProducts.find((p) => String(p._id) === String(productId));
    }
    if (!product) {
        showToast('Product not found. Open Manage Products to update stock.', 'warning');
        return;
    }

    if (typeof Swal === 'undefined') {
        editProduct(productId);
        return;
    }

    const { value: newStock, isConfirmed } = await Swal.fire({
        title: 'Update Stock',
        html: `<p style="margin-bottom:8px;font-size:14px;color:#64748b;">${product.name}</p>`,
        input: 'number',
        inputValue: Number(product.stock) || 0,
        inputAttributes: { min: 0, step: 1 },
        showCancelButton: true,
        confirmButtonText: 'Save Stock',
        confirmButtonColor: '#3b82f6'
    });

    if (!isConfirmed || newStock === undefined || newStock === null || newStock === '') return;

    saveProductPaginationState();

    const formData = new FormData();
    formData.append('name', product.name);
    formData.append('price', product.price);
    formData.append('buyingPrice', product.buyingPrice || 0);
    formData.append('stock', newStock);
    formData.append('stockQuantity', newStock);
    formData.append('hasVariants', product.hasVariants ? 'true' : 'false');
    formData.append('category', product.category || 'General');
    formData.append('brand', (product.brand && product.brand._id) ? product.brand._id : (product.brand || ''));
    formData.append('variants', JSON.stringify(product.variants || []));
    formData.append('icon', product.icon || '📦');
    formData.append('description', product.description || '');

    try {
        const res = await fetch(`/api/products/${productId}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        const result = await res.json();

        if (res.ok && result.success) {
            const updated = result.data || result.product;
            if (updated && updated._id) upsertProductInState(updated);
            showAdminSuccess('Stock Updated', `Stock set to ${newStock} for ${product.name}`);
            fetchDashboardAnalytics();
        } else {
            showToast(result.message || 'Stock update failed.', 'error');
        }
    } catch (err) {
        showToast('Server error during stock update.', 'error');
    }
};

function setupAnalyticsChartToggles() {
    const dailyBtn = document.getElementById('salesTrendDailyBtn');
    const monthlyBtn = document.getElementById('salesTrendMonthlyBtn');
    const barBtn = document.getElementById('topProductsBarBtn');
    const pieBtn = document.getElementById('topProductsPieBtn');

    const setActive = (buttons, activeBtn) => {
        buttons.forEach((btn) => {
            if (!btn) return;
            btn.classList.toggle('active', btn === activeBtn);
        });
    };

    if (dailyBtn && monthlyBtn) {
        dailyBtn.addEventListener('click', () => {
            salesTrendPeriod = 'daily';
            setActive([dailyBtn, monthlyBtn], dailyBtn);
            if (dashboardAnalytics?.salesTrend) renderSalesTrendChart(dashboardAnalytics.salesTrend);
        });
        monthlyBtn.addEventListener('click', () => {
            salesTrendPeriod = 'monthly';
            setActive([dailyBtn, monthlyBtn], monthlyBtn);
            if (dashboardAnalytics?.salesTrend) renderSalesTrendChart(dashboardAnalytics.salesTrend);
        });
    }

    if (barBtn && pieBtn) {
        barBtn.addEventListener('click', () => {
            topProductsChartType = 'bar';
            setActive([barBtn, pieBtn], barBtn);
            if (dashboardAnalytics?.topProducts) renderTopProductsChart(dashboardAnalytics.topProducts);
        });
        pieBtn.addEventListener('click', () => {
            topProductsChartType = 'pie';
            setActive([barBtn, pieBtn], pieBtn);
            if (dashboardAnalytics?.topProducts) renderTopProductsChart(dashboardAnalytics.topProducts);
        });
    }
}

/**
 * ৫.৩: টপ অ্যানালিটিক্স কার্ডগুলো (Total Users, Verified, Pending) আপডেট করা
 * @param {Array} customers - ডাটাবেজ থেকে পাওয়া কাস্টমার অ্যারে
 */
function updateMetricsCards(customers) {
    const totalUsers = customers.length;
    const verifiedUsers = customers.filter(user => user.isVerified === true).length;
    const pendingUsers = totalUsers - verifiedUsers;
    const spamAlerts = customers.filter(user => user.accountStatus === 'blocked').length;

    // DOM এলিমেন্ট আপডেট করা
    if (document.getElementById('stat-total-users')) document.getElementById('stat-total-users').innerText = totalUsers;
    if (document.getElementById('stat-verified-users')) document.getElementById('stat-verified-users').innerText = verifiedUsers;
    if (document.getElementById('stat-pending-users')) document.getElementById('stat-pending-users').innerText = pendingUsers;
    if (document.getElementById('stat-spam-blocks')) document.getElementById('stat-spam-blocks').innerText = spamAlerts;
}

/**
 * গত N মাসের রেজিস্ট্রেশন সিরিজ বিল্ড করা (ডাইনামিক চার্ট ডেটা)
 */
function buildMonthlyRegistrationSeries(customers, months = 6) {
    const now = new Date();
    const labels = [];
    const totals = [];
    const verified = [];

    for (let i = months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const year = d.getFullYear();
        const month = d.getMonth();
        labels.push(d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }));

        const inMonth = (customers || []).filter(c => {
            if (!c.createdAt) return false;
            const created = new Date(c.createdAt);
            return created.getFullYear() === year && created.getMonth() === month;
        });
        totals.push(inMonth.length);
        verified.push(inMonth.filter(u => u.isVerified).length);
    }

    return { labels, totals, verified };
}

/**
 * ৫.৪: কাস্টমার রেজিস্ট্রেশন গ্রোথ চার্ট (Chart.js — real monthly data)
 */
function renderGrowthChart(customers) {
    const ctx = document.getElementById('userGrowthChart');
    if (!ctx || typeof Chart === 'undefined') return;

    if (growthChartInstance) growthChartInstance.destroy();

    const { labels, totals, verified } = buildMonthlyRegistrationSeries(customers || [], 6);
    const periodLabel = document.getElementById('chartPeriodLabel');
    if (periodLabel) periodLabel.textContent = `Last ${labels.length} months · ${(customers || []).length} total users`;

    growthChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'New Registrations',
                    data: totals,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.12)',
                    borderWidth: 2.5,
                    tension: 0.35,
                    fill: true,
                    pointRadius: 4,
                    pointHoverRadius: 6
                },
                {
                    label: 'Verified in Month',
                    data: verified,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.08)',
                    borderWidth: 2,
                    tension: 0.35,
                    fill: false,
                    pointRadius: 3,
                    borderDash: [4, 4]
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'bottom' },
                tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y}` } }
            },
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } },
                x: { grid: { display: false } }
            }
        }
    });
}



/* Expose module functions for HTML onclick + cross-module calls */
Object.assign(window, {
    buildMonthlyRegistrationSeries,
    fetchDashboardAnalytics,
    fetchDashboardData,
    renderGrowthChart,
    renderInventoryAlerts,
    renderSalesTrendChart,
    renderTopProductsChart,
    setupAnalyticsChartToggles,
    setupHeaderDatePicker,
    startLiveClock,
    updateDashboardDate,
    updateMetricsCards,
    updateSalesMetricsCards
});

