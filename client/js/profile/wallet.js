/**
 * Profile Wallet
 * Barrel: client/js/profile.js
 *
 * Globals used from other modules:
 *  * - profileAuthToken
 * - showToast
 * - showInlineFeedback
 *
 * Globals this module exposes:
 *  * - applyRewardSettingsUI
 * - applyAnnouncementUI
 * - updateWalletDisplay
 * - renderCashbackHistory
 * - fetchWalletData
 */

document.addEventListener('DOMContentLoaded', () => {
    const token = window.profileAuthToken;
    if (!token) return;
    const escapeHtml = window.profileEscapeHtml;
    const safeImg = window.profileSafeImg;
    const bindImgFallback = window.profileBindImgFallback;
    const setAvatarSrc = window.profileSetAvatarSrc;
    const IMAGE_PLACEHOLDER = window.profileImagePlaceholder;
    const AVATAR_PLACEHOLDER = window.profileAvatarPlaceholder;
    const IMG_ONERROR = window.profileImgOnerror;
    const showToast = window.profileShowToast;
    const showInlineFeedback = window.profileShowInlineFeedback;
    const currentUserId = window.profileCurrentUserId;
    let currentUser = window.profileCurrentUser;


    // =================================================================
    // ১২. ওয়ালেট ও লয়্যালটি পয়েন্ট (Wallet & Points Converter)
    // =================================================================
    let cachedRewardSettings = {
        cashbackPercentage: 1,
        takaToPointsRatio: 100,
        pointsToTakaConversionRate: 10,
        pointsConversionUnit: 100
    };

    function applyRewardSettingsUI(settings) {
        if (!settings) return;
        cachedRewardSettings = { ...cachedRewardSettings, ...settings };

        const unit = Number(cachedRewardSettings.pointsConversionUnit || 100);
        const takaRate = Number(cachedRewardSettings.pointsToTakaConversionRate ?? 10);

        const rateEl = document.getElementById('conversion-rate-text');
        if (rateEl) {
            rateEl.innerHTML = `<i class="fa-solid fa-circle-info"></i> Conversion Rate: ${unit} Points = ৳${takaRate.toLocaleString()} Wallet Balance`;
        }

        const pointsInput = document.getElementById('points-to-convert');
        if (pointsInput) {
            pointsInput.min = unit;
            pointsInput.step = unit;
            pointsInput.placeholder = `Minimum ${unit} points (multiples of ${unit})`;
        }
    }

    function applyAnnouncementUI(announcement) {
        const cardEl = document.getElementById('dashboard-announcement-card');
        const textEl = document.getElementById('dashboard-announcement-text');
        const highlightsEl = document.getElementById('dashboard-announcement-highlights');
        if (!cardEl || !textEl) return;

        const displayText = announcement?.displayText;
        if (!displayText) {
            cardEl.classList.add('hidden');
            textEl.textContent = '';
            if (highlightsEl) highlightsEl.innerHTML = '';
            return;
        }

        cardEl.classList.remove('hidden');
        textEl.textContent = displayText;

        if (!highlightsEl) return;

        // Live chips for the free-shipping threshold, cashback rate and points
        // rate exactly as configured in the admin panel.
        const highlights = Array.isArray(announcement.highlights) ? announcement.highlights : [];
        highlightsEl.innerHTML = highlights.map((item) => `
            <li class="announcement-highlight">
                <i class="fa-solid fa-${escapeHtml(item.icon || 'tag')}" aria-hidden="true"></i>
                <span class="announcement-highlight-label">${escapeHtml(item.label)}</span>
                <span class="announcement-highlight-value">${escapeHtml(item.value)}</span>
            </li>
        `).join('');
    }

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
        history.slice(0, 12).forEach(tx => {
            const date = new Date(tx.date).toLocaleDateString('en-US', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            const txType = String(tx.type || '').toLowerCase();
            const isDeduct = txType === 'debit';
            const isRefund = txType === 'refund' || txType === 'credit';
            const sign = isDeduct ? '-' : '+';
            const itemClass = isRefund ? 'history-item history-item--refund' : 'history-item';
            const icon = isRefund
                ? '<i class="fa-solid fa-rotate-left history-icon history-icon--refund"></i>'
                : (txType === 'conversion'
                    ? '<i class="fa-solid fa-arrows-rotate history-icon"></i>'
                    : '<i class="fa-solid fa-gift history-icon"></i>');
            const label = tx.note || tx.type || 'Transaction';

            list.innerHTML += `
                <li class="${itemClass}">
                    <span class="history-item-main">
                        ${icon}
                        <span class="history-item-copy">
                            <span class="history-item-note">${escapeHtml(label)}</span>
                            <small class="history-item-date">${date}</small>
                        </span>
                    </span>
                    <span class="history-amount ${isDeduct ? 'deduct' : ''} ${isRefund ? 'refund' : ''}">${sign}৳${Number(tx.amount || 0).toLocaleString()}</span>
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
                applyRewardSettingsUI(data.rewardSettings);
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
            const minPoints = Number(cachedRewardSettings.pointsConversionUnit || 100);

            if (!points || points <= 0) {
                showToast('Please enter the number of points to convert.', 'warning');
                return;
            }
            if (points < minPoints) {
                showToast(`Minimum ${minPoints} points are required.`, 'warning');
                return;
            }
            if (points % minPoints !== 0) {
                showToast(`Points must be in multiples of ${minPoints}.`, 'warning');
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
                    applyRewardSettingsUI(data.rewardSettings);
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

Object.assign(window, {
    applyRewardSettingsUI,
    applyAnnouncementUI,
    updateWalletDisplay,
    renderCashbackHistory,
    fetchWalletData
});

});
