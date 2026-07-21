/**
 * Trigger a 1-click PDF invoice download for a customer order.
 * @param {string} orderId - MongoDB order _id
 * @param {string} [displayOrderId] - Human-readable order id for filename
 * @returns {Promise<boolean>}
 */
async function downloadOrderInvoice(orderId, displayOrderId, triggerBtn = null) {
    const token = localStorage.getItem('token');
    if (!token) {
        if (typeof Swal !== 'undefined') {
            Swal.fire({ icon: 'warning', title: 'Login Required', text: 'Please log in to download your invoice.' });
        } else {
            alert('Please log in to download your invoice.');
        }
        return false;
    }

    if (!orderId) return false;

    let activeBtn = triggerBtn;
    if (!activeBtn && typeof event !== 'undefined' && event?.target) {
        activeBtn = event.target.closest('.btn-order-invoice, .btn-invoice-download');
    }

    const originalHtml = activeBtn?.innerHTML;
    if (activeBtn) {
        activeBtn.disabled = true;
        activeBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Downloading...';
    }

    try {
        const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/invoice`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            let message = 'Failed to download invoice.';
            try {
                const data = await response.json();
                message = data.message || message;
            } catch (_) {
                // Non-JSON error body
            }

            if (typeof Swal !== 'undefined') {
                Swal.fire({ icon: 'error', title: 'Download Failed', text: message });
            } else {
                alert(message);
            }
            return false;
        }

        const blob = await response.blob();
        const disposition = response.headers.get('Content-Disposition') || '';
        const match = disposition.match(/filename="([^"]+)"/i);
        const filename = match?.[1] || `Invoice-${displayOrderId || orderId}.pdf`;

        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        return true;
    } catch (error) {
        console.error('Invoice download error:', error);
        if (typeof Swal !== 'undefined') {
            Swal.fire({ icon: 'error', title: 'Error', text: 'Unable to download invoice. Please try again.' });
        } else {
            alert('Unable to download invoice. Please try again.');
        }
        return false;
    } finally {
        if (activeBtn) {
            activeBtn.disabled = false;
            activeBtn.innerHTML = originalHtml;
        }
    }
}

window.downloadOrderInvoice = downloadOrderInvoice;
