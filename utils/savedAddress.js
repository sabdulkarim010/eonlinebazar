const { isValidDistrict, resolveDistrictLabel } = require('./bangladeshDistricts');

function formatSavedAddressLine(addr) {
    if (!addr) return '';
    const parts = [
        addr.fullAddress,
        addr.upazilaOrThana || addr.upazila || addr.thana,
        addr.district
    ].filter(Boolean);
    return parts.length ? parts.join(', ') : String(addr.fullAddress || '').trim();
}

/**
 * Mirror a saved address into legacy top-level profile fields used by checkout prefill.
 */
function syncUserProfileFromAddress(user, addr) {
    if (!user || !addr) return user;

    user.district = addr.district || '';
    user.upazila = addr.upazilaOrThana || addr.upazila || addr.thana || '';
    user.thana = user.upazila;
    user.fullAddress = addr.fullAddress || '';
    if (addr.phone) {
        user.phone = addr.phone;
    }
    user.address = formatSavedAddressLine(addr);
    return user;
}

function isTruthyFlag(value) {
    if (value === true || value === 1) return true;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        return normalized === 'true'
            || normalized === 'on'
            || normalized === '1'
            || normalized === 'yes';
    }
    return false;
}

function shouldSaveCheckoutAddress(body = {}) {
    return isTruthyFlag(body.saveAddressToProfile)
        || isTruthyFlag(body.saveAddress);
}

function shouldMarkCheckoutAddressDefault(body = {}) {
    return isTruthyFlag(body.saveAddressAsDefault)
        || isTruthyFlag(body.isDefault)
        || isTruthyFlag(body.setAsDefault);
}

function resolveCheckoutStreetAddress(body = {}, shippingDistrict = '', shippingUpazila = '') {
    const direct = String(
        body.shippingStreetAddress || body.streetAddress || body.fullAddress || ''
    ).trim();
    if (direct) return direct;

    const composite = String(
        body.customerAddress || body.shippingAddress || body.address || ''
    ).trim();
    if (!composite) return '';

    const district = String(shippingDistrict || body.shippingDistrict || body.district || '').trim();
    const upazila = String(
        shippingUpazila || body.shippingUpazila || body.upazilaOrThana || body.upazila || ''
    ).trim();

    const parts = composite.split(',').map((part) => part.trim()).filter(Boolean);
    if (district && parts.length && parts[parts.length - 1] === district) {
        parts.pop();
    }
    if (upazila && parts.length && parts[parts.length - 1] === upazila) {
        parts.pop();
    }

    return parts.join(', ').trim() || composite;
}

function parseSavedAddressPayload(body) {
    const {
        label,
        fullAddress,
        phone,
        isDefault,
        district,
        upazilaOrThana,
        upazila,
        thana
    } = body;

    const trimmedStreet = fullAddress ? String(fullAddress).trim() : '';
    const trimmedDistrict = district ? String(district).trim() : '';
    const resolvedUpazila = (upazilaOrThana || upazila || thana)
        ? String(upazilaOrThana || upazila || thana).trim()
        : '';

    if (!trimmedDistrict) {
        return { error: { status: 400, message: 'Please select a district.' } };
    }
    if (!isValidDistrict(trimmedDistrict)) {
        return { error: { status: 400, message: 'Please select a valid Bangladesh district.' } };
    }
    if (!resolvedUpazila) {
        return { error: { status: 400, message: 'Please select an upazila / thana.' } };
    }
    if (!trimmedStreet) {
        return { error: { status: 400, message: 'Street / village / house details are required.' } };
    }

    return {
        data: {
            label: label || 'Home',
            district: resolveDistrictLabel(trimmedDistrict),
            upazilaOrThana: resolvedUpazila,
            fullAddress: trimmedStreet,
            phone: phone || '',
            isDefault: !!isDefault
        }
    };
}

function findMatchingSavedAddress(addresses = [], candidate = {}) {
    return addresses.find((addr) =>
        addr.district === candidate.district
        && addr.upazilaOrThana === candidate.upazilaOrThana
        && addr.fullAddress === candidate.fullAddress
        && String(addr.phone || '').trim() === String(candidate.phone || '').trim()
    ) || null;
}

async function saveAddressForUser(userId, payload, { skipDuplicate = true } = {}) {
    const parsed = parseSavedAddressPayload(payload);
    if (parsed.error) return { saved: false, reason: parsed.error.message };

    const User = require('../models/user');
    const user = await User.findById(userId);
    if (!user) return { saved: false, reason: 'User not found.' };

    const { label, district, upazilaOrThana, fullAddress, phone, isDefault } = parsed.data;

    if (skipDuplicate) {
        const existing = findMatchingSavedAddress(user.addresses, parsed.data);
        if (existing) {
            if (isDefault) {
                user.addresses.forEach((addr) => { addr.isDefault = false; });
                existing.isDefault = true;
                syncUserProfileFromAddress(user, existing);
                await user.save();
                return { saved: true, updated: true, addresses: user.addresses };
            }
            return { saved: false, reason: 'duplicate' };
        }
    }

    const makeDefault = isDefault || user.addresses.length === 0;
    if (makeDefault) {
        user.addresses.forEach((addr) => { addr.isDefault = false; });
    }

    user.addresses.push({
        label,
        district,
        upazilaOrThana,
        fullAddress,
        phone,
        isDefault: makeDefault
    });

    if (makeDefault) {
        user.address = formatSavedAddressLine(user.addresses[user.addresses.length - 1]);
        syncUserProfileFromAddress(user, user.addresses[user.addresses.length - 1]);
    }

    await user.save();
    return { saved: true, addresses: user.addresses };
}

/**
 * Sync a manually entered checkout shipping address into the user's saved addresses.
 * Never throws — safe to call after order placement.
 */
async function syncCheckoutAddressToProfile(userId, body = {}, options = {}) {
    try {
        if (!userId) {
            return { saved: false, skipped: true, reason: 'not_authenticated' };
        }

        if (!shouldSaveCheckoutAddress(body)) {
            return { saved: false, skipped: true, reason: 'not_requested' };
        }

        const shippingDistrict = resolveDistrictLabel(
            options.shippingDistrict
            || body.shippingDistrict
            || body.customerDistrict
            || body.district
        );
        const shippingUpazila = String(
            body.shippingUpazila || body.upazilaOrThana || body.upazila || body.thana || ''
        ).trim();
        const shippingStreetAddress = resolveCheckoutStreetAddress(
            body,
            shippingDistrict,
            shippingUpazila
        );
        const customerPhone = String(
            options.customerPhone || body.customerPhone || body.phone || body.mobile || ''
        ).trim();

        const markDefault = shouldMarkCheckoutAddressDefault(body);

        const result = await saveAddressForUser(userId, {
            label: body.addressLabel || body.label || 'Home',
            fullAddress: shippingStreetAddress,
            phone: customerPhone,
            district: shippingDistrict,
            upazilaOrThana: shippingUpazila,
            isDefault: markDefault
        });

        if (result.saved && markDefault && result.addresses) {
            const defaultAddr = result.addresses.find((addr) => addr.isDefault)
                || result.addresses[result.addresses.length - 1];
            if (defaultAddr) {
                const user = await User.findById(userId);
                if (user) {
                    syncUserProfileFromAddress(user, defaultAddr);
                    await user.save();
                }
            }
        }

        return result;
    } catch (error) {
        console.error('syncCheckoutAddressToProfile error:', error);
        return {
            saved: false,
            reason: error.message || 'sync_failed'
        };
    }
}

module.exports = {
    formatSavedAddressLine,
    parseSavedAddressPayload,
    saveAddressForUser,
    syncCheckoutAddressToProfile,
    syncUserProfileFromAddress,
    shouldSaveCheckoutAddress,
    shouldMarkCheckoutAddressDefault,
    resolveCheckoutStreetAddress
};
