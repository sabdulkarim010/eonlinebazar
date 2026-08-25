/**
 * Project: EOnlineBazar (E-Commerce Platform)
 * File: js/admin/modules/settings-2fa.js
 * Description: Admin self-service 2FA manager.
 */
import '../admin-core.js';
const COURIER_PROVIDER_LABELS = window.COURIER_PROVIDER_LABELS;

/* ==========================================================================
   TWO-FACTOR AUTHENTICATION (2FA) — Admin self-service manager
   Email · Google Authenticator (TOTP) · SMS
========================================================================== */
(function () {
    const AUTH = () => ({ 'Authorization': `Bearer ${localStorage.getItem('adminToken')}` });
    const toast = (m, t = 'success') => showToast(m, t);
    const $ = (id) => document.getElementById(id);

    let state = {
        method: 'email', twoFactorEnabled: true,
        totpConfigured: false, totpPending: false,
        phone: '', maskedPhone: '', maskedEmail: '', smsConfigured: false
    };

    /* ---- Small helpers ---- */

    function maskEmailFE(email) {
        if (!email) return 'Not set';
        const [user, domain] = String(email).split('@');
        if (!domain) return email;
        return user.slice(0, 2) + '***@' + domain;
    }

    const TWOFA_METHOD_LABELS = {
        email: 'Email OTP',
        totp: 'Google Authenticator',
        sms: 'SMS OTP'
    };

    async function confirmSwitchAuthMethod({
        title = 'Switch Authentication Method?',
        text = 'Are you sure you want to disable Google Authenticator and switch to Email OTP?'
    } = {}) {
        if (typeof window.showCustomConfirm === 'function') {
            return !!(await window.showCustomConfirm(title, text, null, 'danger'));
        }
        return window.confirm(`${title}\n\n${text}`);
    }

    // Put a button into a loading state; returns a restore() that reverses it.
    function setBusy(btn, label) {
        if (!btn) return () => {};
        if (btn.dataset.loading === '1') return () => {}; // already busy → ignore double clicks
        const html = btn.innerHTML;
        const wasDisabled = btn.disabled;
        btn.dataset.loading = '1';
        btn.disabled = true;
        btn.classList.add('is-loading');
        btn.innerHTML = `<span class="twofa-spinner" aria-hidden="true"></span> ${label || 'Please wait…'}`;
        return () => {
            btn.dataset.loading = '0';
            btn.disabled = wasDisabled;
            btn.classList.remove('is-loading');
            btn.innerHTML = html;
        };
    }

    // Unified JSON fetch. Never throws on non-2xx — returns { ok, status, data }.
    async function api(url, method = 'GET', body) {
        const opts = { method, headers: { ...AUTH() } };
        if (body !== undefined) {
            opts.headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(body);
        }
        const res = await fetch(url, opts);
        let data = {};
        try { data = await res.json(); } catch (_) { /* empty / non-JSON body */ }
        return { ok: res.ok, status: res.status, data };
    }

    async function loadStatus() {
        if (!$('twofaMethods')) return; // settings section not mounted yet
        try {
            const { data } = await api('/api/admin/2fa/status');
            if (data && data.success) { state = { ...state, ...data.data }; render(); }
        } catch (err) {
            console.error('2FA status load failed:', err);
        }
    }

    function setBadge(el, text, kind) {
        if (!el) return;
        el.textContent = text;
        el.dataset.state = kind; // off | ready | active
    }

    function render() {
        // Active-method highlight (drives the check icon + border via CSS)
        document.querySelectorAll('.twofa-method').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.method === state.method);
        });

        if ($('twofaEmailTarget')) {
            const masked = state.email ? maskEmailFE(state.email) : (state.maskedEmail || 'SMTP default');
            $('twofaEmailTarget').textContent = `OTP will be sent to: ${masked}`;
        }
        if ($('twofaEmailHint')) {
            const masked = state.email ? maskEmailFE(state.email) : (state.maskedEmail || 'SMTP default');
            $('twofaEmailHint').textContent = `OTP will be sent to: ${masked}`;
        }
        if ($('twofaTotpState')) $('twofaTotpState').textContent = state.totpConfigured ? 'Active & verified' : (state.totpPending ? 'Setup in progress' : 'Not configured');
        if ($('twofaSmsTarget')) $('twofaSmsTarget').textContent = state.maskedPhone ? `Code texted to ${state.maskedPhone}` : 'Add a phone number';

        // Status badges
        setBadge($('twofaEmailBadge'), state.method === 'email' ? 'Active' : 'Ready', state.method === 'email' ? 'active' : 'ready');
        setBadge($('twofaTotpBadge'),
            state.totpConfigured ? (state.method === 'totp' ? 'Active' : 'Configured') : 'Not set up',
            state.totpConfigured ? (state.method === 'totp' ? 'active' : 'ready') : 'off');
        setBadge($('twofaSmsBadge'),
            state.smsConfigured ? (state.method === 'sms' ? 'Active' : 'Configured') : 'Not set up',
            state.smsConfigured ? (state.method === 'sms' ? 'active' : 'ready') : 'off');

        // SMS panel visible when SMS selected OR a phone is already on file
        const showSms = state.method === 'sms' || state.smsConfigured;
        if ($('twofaPhoneGroup')) $('twofaPhoneGroup').style.display = showSms ? 'block' : 'none';
        if ($('twofaPhoneInput') && document.activeElement !== $('twofaPhoneInput')) $('twofaPhoneInput').value = state.phone || '';

        // TOTP panel visible when Authenticator selected OR already configured
        const showTotp = state.method === 'totp' || state.totpConfigured;
        if ($('twofaTotpPanel')) $('twofaTotpPanel').style.display = showTotp ? 'block' : 'none';
        if ($('twofaSetupTotpBtn') && $('twofaSetupTotpBtn').dataset.loading !== '1') {
            $('twofaSetupTotpBtn').innerHTML = state.totpConfigured
                ? '<i class="fa-solid fa-rotate"></i> Re-configure'
                : '<i class="fa-solid fa-qrcode"></i> Set up Google Authenticator';
        }
        if ($('twofaDisableTotpBtn')) $('twofaDisableTotpBtn').style.display = state.totpConfigured ? 'inline-flex' : 'none';
    }

    /* ---- Actions ---- */

    async function updateMethod(method, extra, srcBtn) {
        const restore = setBusy(srcBtn, 'Saving…');
        try {
            const { data } = await api('/api/admin/2fa/method', 'PUT', { method, ...(extra || {}) });
            if (!data.success) { toast(data.message || 'Failed to update 2FA method.', 'error'); return false; }
            state.method = data.data.method;
            state.phone = data.data.phone || state.phone;
            state.maskedPhone = data.data.maskedPhone || state.maskedPhone;
            if (state.phone) state.smsConfigured = true;
            toast(data.message, 'success');
            render();
            return true;
        } catch (err) {
            console.error('2FA method update failed:', err);
            toast('Server error updating 2FA method.', 'error');
            return false;
        } finally { restore(); }
    }

    async function onMethodClick(btn) {
        const method = btn.dataset.method;
        if (!method || method === state.method) return;

        // Authenticator not yet configured → reveal setup instead of switching.
        if (method === 'totp' && !state.totpConfigured) {
            document.querySelectorAll('.twofa-method').forEach(b => b.classList.toggle('active', b === btn));
            if ($('twofaTotpPanel')) $('twofaTotpPanel').style.display = 'block';
            toast('Set up Google Authenticator, then verify to activate it.', 'info');
            return;
        }
        // SMS not yet verified → reveal the phone + test-code panel.
        if (method === 'sms' && !state.smsConfigured) {
            document.querySelectorAll('.twofa-method').forEach(b => b.classList.toggle('active', b === btn));
            if ($('twofaPhoneGroup')) $('twofaPhoneGroup').style.display = 'block';
            if ($('twofaPhoneInput')) $('twofaPhoneInput').focus();
            toast('Add your phone number and verify it to enable SMS 2FA.', 'info');
            return;
        }

        const fromLabel = TWOFA_METHOD_LABELS[state.method] || 'the current method';
        const toLabel = TWOFA_METHOD_LABELS[method] || method;
        const switchText = state.method === 'totp' && method === 'email'
            ? 'Are you sure you want to disable Google Authenticator and switch to Email OTP?'
            : `Are you sure you want to switch from ${fromLabel} to ${toLabel}?`;

        const confirmed = await confirmSwitchAuthMethod({ text: switchText });
        if (!confirmed) return;

        await updateMethod(method, {}, btn);
    }

    async function onEditEmail(btn) {
        const current = String(state.email || '').trim();
        let nextEmail = current;

        if (typeof Swal !== 'undefined') {
            const result = await Swal.fire({
                title: 'Email for OTP Delivery',
                text: 'OTP codes will be sent to this address.',
                input: 'email',
                inputValue: current,
                inputPlaceholder: 'your@email.com',
                showCancelButton: true,
                confirmButtonText: 'Save Email',
                cancelButtonText: 'Cancel',
                confirmButtonColor: '#3b82f6',
                cancelButtonColor: '#94a3b8',
                inputValidator: (value) => {
                    const email = String(value || '').trim();
                    if (!email) return 'Enter an email address.';
                    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Invalid email address format.';
                    return null;
                }
            });
            if (!result.isConfirmed) return;
            nextEmail = String(result.value || '').trim().toLowerCase();
        } else {
            const typed = window.prompt('Email for OTP Delivery', current);
            if (typed == null) return;
            nextEmail = String(typed).trim().toLowerCase();
            if (!nextEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
                return toast('Invalid email address format.', 'error');
            }
        }

        const restore = setBusy(btn, 'Saving…');
        try {
            const { data } = await api('/api/admin/2fa/method', 'PUT', { email: nextEmail });
            if (!data.success) { toast(data.message || 'Failed to save email.', 'error'); return; }
            state.email = (data.data && data.data.email) || nextEmail;
            state.maskedEmail = (data.data && data.data.maskedEmail) || maskEmailFE(state.email);
            const profileEmail = document.getElementById('settingsAdminEmail');
            if (profileEmail) profileEmail.value = state.email || '';
            toast('OTP email updated.', 'success');
            render();
        } catch (err) {
            console.error('Save OTP email failed:', err);
            toast('Server error saving email.', 'error');
        } finally { restore(); }
    }

    async function onSavePhone(btn) {
        const phone = ($('twofaPhoneInput').value || '').trim();
        if (!phone) return toast('Please enter a phone number.', 'error');
        const restore = setBusy(btn, 'Saving…');
        try {
            // Save the phone WITHOUT forcing the method (empty method = keep current).
            const { data } = await api('/api/admin/2fa/method', 'PUT', { phone });
            if (!data.success) { toast(data.message || 'Failed to save phone number.', 'error'); return; }
            state.phone = (data.data && data.data.phone) || phone;
            state.maskedPhone = (data.data && data.data.maskedPhone) || state.maskedPhone;
            state.smsConfigured = !!state.phone;
            toast('Phone number saved. Send a test code to verify it.', 'success');
            render();
        } catch (err) {
            console.error('Save phone failed:', err);
            toast('Server error saving phone number.', 'error');
        } finally { restore(); }
    }

    async function onSendSms(btn) {
        const phone = ($('twofaPhoneInput').value || '').trim();
        if (!phone) return toast('Enter a phone number first.', 'error');
        const restore = setBusy(btn, 'Sending…');
        try {
            const { data } = await api('/api/admin/2fa/sms/send', 'POST', { phone });
            if (!data.success) { toast(data.message || 'Failed to send test code.', 'error'); return; }
            state.phone = phone;
            state.smsConfigured = true;
            if (data.maskedPhone) state.maskedPhone = data.maskedPhone;
            if ($('twofaSmsVerifyRow')) $('twofaSmsVerifyRow').style.display = 'block';
            if ($('twofaSmsHint')) $('twofaSmsHint').textContent = data.delivered
                ? `We texted a 6-digit code to ${data.maskedPhone}. It expires in ${data.expiresInMinutes || 5} minutes.`
                : 'Code generated. SMS is in console mode — check the server terminal for the 6-digit code.';
            if ($('twofaSmsCode')) { $('twofaSmsCode').value = ''; $('twofaSmsCode').focus(); }
            toast(data.delivered ? 'Test code sent via SMS.' : 'Code generated — check the server console.', data.delivered ? 'success' : 'info');
        } catch (err) {
            console.error('Send SMS code failed:', err);
            toast('Server error sending test code.', 'error');
        } finally { restore(); }
    }

    async function onVerifySms(btn) {
        const code = ($('twofaSmsCode').value || '').replace(/\D/g, '').trim();
        if (code.length !== 6) return toast('Enter the 6-digit code sent to your phone.', 'error');
        const restore = setBusy(btn, 'Verifying…');
        try {
            const { data } = await api('/api/admin/2fa/sms/verify', 'POST', { token: code });
            if (!data.success) { toast(data.message || 'Invalid code, please try again.', 'error'); return; }
            state.method = 'sms';
            state.smsConfigured = true;
            if (data.maskedPhone) state.maskedPhone = data.maskedPhone;
            toast('SMS OTP Activated Successfully', 'success');
            if ($('twofaSmsVerifyRow')) $('twofaSmsVerifyRow').style.display = 'none';
            render();
        } catch (err) {
            console.error('Verify SMS code failed:', err);
            toast('Server error verifying code.', 'error');
        } finally { restore(); }
    }

    async function onSetupTotp(btn) {
        const restore = setBusy(btn, 'Generating…');
        try {
            const { data } = await api('/api/admin/2fa/totp/setup', 'POST');
            if (!data.success) { toast(data.message || 'Failed to start setup.', 'error'); return; }
            if ($('twofaQrImg')) $('twofaQrImg').src = data.qrCode;
            if ($('twofaManualKey')) $('twofaManualKey').textContent = data.manualKey;
            if ($('twofaQrWrap')) $('twofaQrWrap').style.display = 'flex';
            if ($('twofaVerifyCode')) { $('twofaVerifyCode').value = ''; $('twofaVerifyCode').focus(); }
            state.totpPending = true;
        } catch (err) {
            console.error('TOTP setup failed:', err);
            toast('Server error during setup.', 'error');
        } finally { restore(); }
    }

    async function onVerifyTotp(btn) {
        const code = ($('twofaVerifyCode') && $('twofaVerifyCode').value || '').replace(/\D/g, '').trim();
        if (code.length !== 6) return toast('Enter the 6-digit code from your authenticator app.', 'error');
        const restore = setBusy(btn, 'Verifying…');
        try {
            const { data } = await api('/api/admin/2fa/totp/verify', 'POST', { token: code });
            if (!data.success) { toast(data.message || 'Invalid Code, please try again.', 'error'); return; }
            state.totpConfigured = true;
            state.method = 'totp';
            state.totpPending = false;
            toast('Google Authenticator Activated Successfully', 'success');
            if ($('twofaQrWrap')) $('twofaQrWrap').style.display = 'none';
            render();
        } catch (err) {
            console.error('TOTP verify failed:', err);
            toast('Server error during verification.', 'error');
        } finally { restore(); }
    }

    async function onDisableTotp(btn) {
        const confirmed = await confirmSwitchAuthMethod({
            text: 'Are you sure you want to disable Google Authenticator and switch to Email OTP?'
        });
        if (!confirmed) return;
        const restore = setBusy(btn, 'Disabling…');
        try {
            const { data } = await api('/api/admin/2fa/totp/disable', 'POST');
            if (!data.success) { toast(data.message || 'Failed to disable.', 'error'); return; }
            state.totpConfigured = false;
            state.method = 'email';
            state.totpPending = false;
            toast(data.message || 'Google Authenticator disabled.', 'success');
            if ($('twofaQrWrap')) $('twofaQrWrap').style.display = 'none';
            render();
        } catch (err) {
            console.error('TOTP disable failed:', err);
            toast('Server error.', 'error');
        } finally { restore(); }
    }

    /* ---- Event delegation (robust: works no matter when the DOM mounts) ---- */

    document.addEventListener('click', (e) => {
        if (!e.target || !e.target.closest) return;

        // Method tiles (spans inside the button also resolve to the tile)
        const tile = e.target.closest('.twofa-method');
        if (tile && $('twofaMethods') && $('twofaMethods').contains(tile)) {
            onMethodClick(tile);
            return;
        }

        const btn = e.target.closest('button');
        if (!btn || !btn.id) return;
        switch (btn.id) {
            case 'twofaEditEmailBtn':   onEditEmail(btn); break;
            case 'twofaSavePhoneBtn':   onSavePhone(btn); break;
            case 'twofaSendSmsBtn':     onSendSms(btn); break;
            case 'twofaVerifySmsBtn':   onVerifySms(btn); break;
            case 'twofaSetupTotpBtn':   onSetupTotp(btn); break;
            case 'twofaVerifyTotpBtn':  onVerifyTotp(btn); break;
            case 'twofaDisableTotpBtn': onDisableTotp(btn); break;
        }
    });

    // Enter key submits the code fields
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || !e.target) return;
        if (e.target.id === 'twofaVerifyCode') { e.preventDefault(); onVerifyTotp($('twofaVerifyTotpBtn')); }
        else if (e.target.id === 'twofaSmsCode') { e.preventDefault(); onVerifySms($('twofaVerifySmsBtn')); }
    });

    // Public hook: called whenever the Settings view is opened
    window.refreshTwoFactorSettings = loadStatus;

    document.addEventListener('DOMContentLoaded', loadStatus);
    // If the module evaluates after DOMContentLoaded already fired, load now too.
    if (document.readyState !== 'loading') loadStatus();
})();

/* Hero banner management lives in js/admin-banner.js */



/* Expose module functions for HTML onclick + cross-module calls */
Object.assign(window, {
    applyAdminSettingsToUI,
    applyAnnouncementSettingsToUI,
    applyBrandingAsset,
    applyBrandingPreviewFromSettings,
    applyCourierSettingsToUI,
    applyDeliverySettingsToUI,
    applyFlashSaleSettingsToUI,
    applyFooterSettingsToUI,
    applyMasterSettingsToUI,
    applyRateLimitSettingsToUI,
    applySmsSettingsToUI,
    applyWhatsAppSettingsToUI,
    assignBrandingFile,
    autoLinkFooterCmsRoutes,
    bindPaymentMethodCardEvents,
    bindRateLimitSettingsForm,
    bindSystemSettingsSectionForm,
    buildAnnouncementPreviewText,
    buildPageContentQuillToolbarHtml,
    cacheBustBrandingUrl,
    checkGAStatus,
    clearAllPaymentBadges,
    collectFooterSettingsPayload,
    collectPaymentMethodOrderFromDom,
    confirmAddPageToFooter,
    deletePaymentMethod,
    destroyPageContentQuill,
    deviceIcon,
    ensurePageContentQuill,
    escapeHtml,
    fetchAdminSessions,
    fetchAdminSettings,
    fetchAuditLogs,
    fetchBlacklist,
    fetchMasterSettings,
    fetchRateLimitSettings,
    fetchSecurityLogs,
    findFooterCmsPageByLabel,
    footerCmsPageOptionsHtml,
    footerTempId,
    footerToggleHtml,
    formatDuration,
    formatProcessingFeeBadge,
    getActivePageState,
    getPageContentQuillHtml,
    getPageContentTabLabel,
    initAuditView,
    isCurrentSession,
    isFooterPlaceholderUrl,
    loadCacheSettings,
    loadCacheVersionDisplay,
    loadSandboxStatus,
    logoutAdminSession,
    logoutOtherAdminSessions,
    normalizeBrandingUrl,
    normalizeFooterMatchKey,
    openAddPageToFooterModal,
    openCreatePageModal,
    paymentMethodFallbackIcon,
    persistPaymentMethodOrder,
    populateDistrictSelect,
    populateFooterColumnSelects,
    populateShopHomeCityOptions,
    previewBrandingFile,
    refreshAuditActiveTab,
    removeBlacklist,
    renderFooterColumnsEditor,
    renderFooterPaymentEditor,
    renderFooterSocialEditor,
    renderPageContentEditor,
    renderPageContentTabs,
    renderPaymentMethodsGrid,
    renderSessionCards,
    resetPaymentMethodForm,
    resolvePageContentEditorHtml,
    restartCacheBuster,
    revokeBrandingObjectUrl,
    revokeSession,
    saveAdminProfile,
    saveAdminSettings,
    saveDeliverySettings,
    saveFooterSettings,
    saveMasterSettings,
    savePageContent,
    savePaymentMethodForm,
    saveStoreBrandingForm,
    setBrandingPreviewImage,
    setButtonLoading,
    setPageContentQuillHtml,
    setPaymentMethodLogoPreview,
    setupAdminSettingsForms,
    setupAdminSettingsTabs,
    setupAuditTabs,
    setupBrandingDropzones,
    setupFooterSettingsManager,
    setupPageContentManager,
    setupPaymentMethodsManager,
    setupSystemSettingsSectionForms,
    showLocalBrandingPreview,
    submitBlacklist,
    submitCreatePage,
    syncCreatePageSlugPreview,
    syncFooterStateFromDom,
    syncPageContentFromDom,
    timeAgo,
    titleToPageSlug,
    toggleCourierCredentialPanels,
    toggleEntirePaymentForm,
    togglePaymentMethodActive,
    togglePaymentMethodTypeFields,
    toggleServiceWorkerSetting,
    updateAnnouncementSettingsPreview,
    updateCourierSettingsPreview,
    updateCreatePageFooterColumnVisibility,
    updateFlashSaleSettingsPreview,
    updateFooterSettingsPreview,
    updateMasterSettingsPreview,
    updatePageContentFooterActions,
    updatePaymentFormVisibilityUI,
    updatePaymentMethodsPreview,
    updateRateLimitSettingsPreview,
    updateSessionsUI,
    updateSidebarStoreLogo,
    updateSiteFaviconLink,
    updateSmsSettingsPreview,
    updateWhatsAppSettingsPreview,
    uploadFooterIcon
});
