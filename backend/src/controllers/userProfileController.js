/********************************************************************
 * Project: EonlineBazar
 * File: userProfileController.js
 * Location: backend/src/controllers/userProfileController.js
 * Description: Profile, avatar, contact OTP, addresses, and loyalty conversion.
 ********************************************************************/

const User = require('../models/user');
const Setting = require('../models/Setting');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const cloudinary = require('cloudinary').v2;
const sharp = require('sharp');
const requestIp = require('request-ip');
const { logSecurityEvent } = require('../utils/securityLogger');
const { formatSavedAddressLine, parseSavedAddressPayload, syncUserProfileFromAddress } = require('../utils/savedAddress');
const {
    loadRewardSettings,
    calculatePointsCashValue,
    POINTS_CONVERSION_UNIT
} = require('../utils/rewardSettings');
const { toPublicAnnouncementPayload } = require('../utils/announcementSettings');
const { getDeliverySettings } = require('../services/deliveryChargeService');
const { sendAdminOtpSms } = require('../utils/smsSender');

const PROFILE_OTP_TTL_MS = 5 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 6;

function generateProfileOtp() {
    return String(crypto.randomInt(100000, 1000000));
}

function normalizeProfileOtp(value) {
    return String(value || '').replace(/\D/g, '').slice(0, 6);
}

function maskEmail(email = '') {
    const [local, domain] = String(email).split('@');
    if (!local || !domain) return '***';
    const visible = local.slice(0, Math.min(2, local.length));
    return `${visible}***@${domain}`;
}

function maskPhone(phone = '') {
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length < 4) return '***';
    return `***${digits.slice(-4)}`;
}

function isValidBangladeshMobile(value = '') {
    const digits = String(value).replace(/\D/g, '');
    return /^01[3-9]\d{8}$/.test(digits);
}

function clearProfileUpdateOtpFields() {
    return {
        profileUpdateOtp: null,
        profileUpdateOtpExpires: null,
        profileUpdateType: null,
        pendingEmail: null,
        pendingMobile: null
    };
}

// ইমেইল পাঠানোর কনফিগারেশন
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER, 
        pass: process.env.EMAIL_PASS  
    }
});
function getClientIp(req) {
    const detected = requestIp.getClientIp(req);
    if (detected) return detected;
    const fwd = req.headers['x-forwarded-for'];
    if (fwd) return fwd.split(',')[0].trim();
    return (req.socket && req.socket.remoteAddress) || req.ip || '';
}

/* =======================================================
   ৫. ইউজারের প্রোফাইল ডাটা পাঠানো (Get Profile)
   ======================================================= */
exports.getUserProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password'); 
        
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        const [rewardSettings, masterSettings, deliverySettings] = await Promise.all([
            loadRewardSettings(),
            Setting.getOrCreate(),
            getDeliverySettings()
        ]);

        const profile = user.toObject();
        profile.rewardSettings = rewardSettings;
        profile.deliverySettings = deliverySettings;
        profile.announcement = toPublicAnnouncementPayload(
            { ...masterSettings.toObject(), freeShippingThreshold: deliverySettings.freeShippingThreshold },
            rewardSettings
        );

        res.status(200).json(profile);
    } catch (error) {
        console.error("Get Profile Error:", error);
        res.status(500).json({ success: false, message: "Server error while fetching profile." });
    }
};

/* =======================================================
   ৬. প্রোফাইল ইনফরমেশন আপডেট করা (Update Profile)
   ======================================================= */
exports.updateUserProfile = async (req, res) => {
    try {
        const {
            name,
            firstName,
            lastName,
            phone,
            mobile,
            gender,
            dateOfBirth,
            address,
            district,
            upazila,
            thana,
            fullAddress
        } = req.body;
        
        const contactNumber = (phone !== undefined ? phone : mobile);

        const updateFields = {};
        const allowedGenders = ['Male', 'Female', 'Other'];
        if (firstName !== undefined) updateFields.firstName = String(firstName).trim();
        if (lastName !== undefined) updateFields.lastName = String(lastName).trim();
        if (name !== undefined && firstName === undefined && lastName === undefined) {
            const trimmed = String(name).trim();
            if (!trimmed) {
                return res.status(400).json({
                    success: false,
                    message: 'Full name is required.'
                });
            }
            const parts = trimmed.split(/\s+/).filter(Boolean);
            updateFields.firstName = parts[0] || trimmed;
            updateFields.lastName = parts.length > 1 ? parts.slice(1).join(' ') : trimmed;
        }
        if (district !== undefined) updateFields.district = String(district).trim();
        if (upazila !== undefined) updateFields.upazila = String(upazila).trim();
        if (thana !== undefined) {
            updateFields.thana = String(thana).trim();
        } else if (upazila !== undefined) {
            updateFields.thana = String(upazila).trim();
        }
        if (fullAddress !== undefined) updateFields.fullAddress = String(fullAddress).trim();

        const resolvedDistrict = updateFields.district;
        const resolvedUpazila = updateFields.upazila || updateFields.thana;
        const resolvedFullAddress = updateFields.fullAddress;
        if (resolvedDistrict || resolvedUpazila || resolvedFullAddress) {
            const parts = [resolvedFullAddress, resolvedUpazila, resolvedDistrict].filter(Boolean);
            updateFields.address = parts.join(', ');
        } else if (address !== undefined) {
            updateFields.address = String(address).trim();
        }

        if (contactNumber !== undefined) {
            const user = await User.findById(req.user.id).select('email mobile phone');
            if (!user) {
                return res.status(404).json({ success: false, message: "User not found." });
            }

            const normalizedPhone = String(contactNumber).replace(/\D/g, '');
            const currentPhone = String(user.mobile || user.phone || '').replace(/\D/g, '');

            if (normalizedPhone && normalizedPhone !== currentPhone) {
                return res.status(400).json({
                    success: false,
                    message: "Phone number changes require OTP verification. Use Security → Update Phone."
                });
            }
        }

        if (gender !== undefined) {
            if (gender === '' || gender === null) {
                updateFields.gender = undefined;
            } else if (allowedGenders.includes(gender)) {
                updateFields.gender = gender;
            } else {
                return res.status(400).json({
                    success: false,
                    message: "Please select a valid gender option."
                });
            }
        }

        if (dateOfBirth !== undefined) {
            if (dateOfBirth === '' || dateOfBirth === null) {
                updateFields.dateOfBirth = undefined;
            } else {
                const parsedDob = new Date(dateOfBirth);
                if (Number.isNaN(parsedDob.getTime())) {
                    return res.status(400).json({
                        success: false,
                        message: "Please provide a valid date of birth."
                    });
                }
                updateFields.dateOfBirth = parsedDob;
            }
        }

        const unsetFields = {};
        if (updateFields.gender === undefined && gender !== undefined && (gender === '' || gender === null)) {
            unsetFields.gender = '';
            delete updateFields.gender;
        }
        if (updateFields.dateOfBirth === undefined && dateOfBirth !== undefined && (dateOfBirth === '' || dateOfBirth === null)) {
            unsetFields.dateOfBirth = '';
            delete updateFields.dateOfBirth;
        }

        const updateQuery = { $set: updateFields };
        if (Object.keys(unsetFields).length > 0) {
            updateQuery.$unset = unsetFields;
        }

        const updatedUser = await User.findByIdAndUpdate(
            req.user.id,
            updateQuery,
            { new: true, runValidators: true } 
        ).select('-password');

        if (!updatedUser) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        res.status(200).json({ success: true, message: "Profile updated successfully!", user: updatedUser });
    } catch (error) {
        console.error("Update Profile Error:", error);
        res.status(500).json({ success: false, message: "Server error while updating profile." });
    }
};

/* =======================================================
   ৭. প্রোফাইল ছবি আপডেট করা (Update Avatar)
   ======================================================= */
exports.updateUserAvatar = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "No image file provided." });
        }

        // Sharp দিয়ে ইমেজ ৩০০x৩০০ স্কয়ার ও কম্প্রেস করা হলো
        const compressedBuffer = await sharp(req.file.buffer)
            .resize({ width: 300, height: 300, fit: 'cover' }) 
            .jpeg({ quality: 70 }) 
            .toBuffer();

        // ক্লাউডিনারিতে আপলোড স্ট্রিম
        cloudinary.uploader.upload_stream(
            { folder: 'eOnlineBazar/avatars' },
            async (error, result) => {
                if (error) {
                    console.error("Cloudinary Upload Error:", error);
                    return res.status(500).json({ success: false, message: "Cloudinary upload failed." });
                }

                try {
                    const avatarUrl = result.secure_url;
                    const publicId = result.public_id; 

                    // পুরনো ছবি ক্লাউডিনারি থেকে ডিলিট করা
                    const oldUser = await User.findById(req.user.id);
                    if (oldUser && oldUser.avatarPublicId) {
                        await cloudinary.uploader.destroy(oldUser.avatarPublicId);
                        console.log("✅ Old avatar successfully deleted from Cloudinary");
                    }

                    // ডাটাবেজে আপডেট করা
                    const updatedUser = await User.findByIdAndUpdate(
                        req.user.id, 
                        { 
                            avatar: avatarUrl,
                            avatarPublicId: publicId 
                        },
                        { returnDocument: 'after' }
                    );

                    if (!updatedUser) {
                        return res.status(404).json({ success: false, message: "User not found in database." });
                    }

                    console.log("🌟 Successfully compressed & saved to MongoDB for User:", updatedUser.name);

                    return res.status(200).json({ 
                        success: true, 
                        message: "Profile photo successfully compressed, updated, and old photo removed!", 
                        avatarUrl 
                    });

                } catch (dbError) {
                    console.error("❌ MongoDB Save Error inside Cloudinary Callback:", dbError);
                    return res.status(500).json({ 
                        success: false, 
                        message: "Image uploaded, but failed to save data in database." 
                    });
                }
            }
        ).end(compressedBuffer); 

    } catch (error) {
        console.error("Avatar Update Error:", error);
        res.status(500).json({ success: false, message: "Server error while uploading avatar." });
    }
};

/* =======================================================
   ৮. বর্তমান পাসওয়ার্ড পরিবর্তন করা (Change Password)
   ======================================================= */
exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: "Current password and new password are required."
            });
        }

        if (String(newPassword).length < MIN_PASSWORD_LENGTH) {
            return res.status(400).json({
                success: false,
                message: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`
            });
        }

        if (confirmPassword !== undefined && newPassword !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: "New password and confirm password do not match."
            });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            await logSecurityEvent({
                action: 'Customer Password Change Failed',
                actor: user.email,
                actorType: 'customer',
                ipAddress: getClientIp(req),
                details: 'Incorrect current password'
            });
            return res.status(400).json({ success: false, message: "Incorrect current password." });
        }

        const sameAsCurrent = await bcrypt.compare(newPassword, user.password);
        if (sameAsCurrent) {
            return res.status(400).json({
                success: false,
                message: "New password must be different from your current password."
            });
        }

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();

        await logSecurityEvent({
            action: 'Customer Password Changed',
            actor: user.email,
            actorType: 'customer',
            ipAddress: getClientIp(req),
            details: 'Password updated from profile security tab'
        });

        res.status(200).json({ success: true, message: "Password changed successfully!" });
    } catch (error) {
        console.error("Change Password Error:", error);
        res.status(500).json({ success: false, message: "Server error while changing password." });
    }
};

/* =======================================================
   ৮.১ ইমেইল / ফোন আপডেট — OTP অনুরোধ (Request Contact OTP)
   ======================================================= */
exports.requestContactUpdateOtp = async (req, res) => {
    try {
        const type = String(req.body.type || '').trim().toLowerCase();
        const rawValue = String(req.body.value || '').trim();

        if (!['email', 'mobile'].includes(type)) {
            return res.status(400).json({
                success: false,
                message: "Invalid update type. Use email or mobile."
            });
        }

        if (!rawValue) {
            return res.status(400).json({
                success: false,
                message: type === 'email' ? "Please enter a new email address." : "Please enter a new phone number."
            });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        let normalizedValue = rawValue;
        if (type === 'email') {
            normalizedValue = rawValue.toLowerCase();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedValue)) {
                return res.status(400).json({ success: false, message: "Please enter a valid email address." });
            }
            if (normalizedValue === user.email) {
                return res.status(400).json({ success: false, message: "This is already your current email address." });
            }
            const taken = await User.findOne({ email: normalizedValue, _id: { $ne: user._id } });
            if (taken) {
                return res.status(400).json({ success: false, message: "This email is already registered to another account." });
            }
        } else {
            normalizedValue = rawValue.replace(/\D/g, '');
            if (!isValidBangladeshMobile(normalizedValue)) {
                return res.status(400).json({
                    success: false,
                    message: "Please enter a valid Bangladesh mobile number (e.g. 01XXXXXXXXX)."
                });
            }
            const currentMobile = String(user.mobile || user.phone || '').replace(/\D/g, '');
            if (normalizedValue === currentMobile) {
                return res.status(400).json({ success: false, message: "This is already your current phone number." });
            }
            const taken = await User.findOne({
                mobile: normalizedValue,
                _id: { $ne: user._id }
            });
            if (taken) {
                return res.status(400).json({ success: false, message: "This phone number is already registered to another account." });
            }
        }

        const otp = generateProfileOtp();
        const otpExpiry = Date.now() + PROFILE_OTP_TTL_MS;

        user.profileUpdateOtp = otp;
        user.profileUpdateOtpExpires = otpExpiry;
        user.profileUpdateType = type;
        user.pendingEmail = type === 'email' ? normalizedValue : null;
        user.pendingMobile = type === 'mobile' ? normalizedValue : null;
        await user.save();

        let delivery = { delivered: false, channel: type === 'email' ? 'email' : 'sms' };

        if (type === 'email') {
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: normalizedValue,
                subject: 'eOnlineBazar - Verify Your New Email',
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 10px; max-width: 500px; margin: auto;">
                        <h2 style="color: #2563eb;">eOnlineBazar · Security Verification</h2>
                        <p>Hi <b>${user.name}</b>,</p>
                        <p>Use this 6-digit code to confirm your new email address:</p>
                        <h1 style="color: #2563eb; letter-spacing: 5px; text-align: center;">${otp}</h1>
                        <p style="color: #64748b; font-size: 13px; text-align: center;">This code expires in 5 minutes. Do not share it with anyone.</p>
                    </div>
                `
            };

            try {
                if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
                    await transporter.sendMail(mailOptions);
                    delivery.delivered = true;
                } else {
                    console.log(`[Profile OTP] Email to ${normalizedValue}: ${otp} (EMAIL_USER/EMAIL_PASS not set)`);
                }
            } catch (mailErr) {
                console.error('[Profile OTP] Email send failed:', mailErr.message);
                console.log(`[Profile OTP] Fallback — Email to ${normalizedValue}: ${otp}`);
            }
        } else {
            const smsResult = await sendAdminOtpSms({
                to: normalizedValue,
                otp,
                username: user.name,
                expiresInMinutes: 5
            });
            delivery.delivered = !!smsResult.delivered;
            if (!smsResult.delivered) {
                console.log(`[Profile OTP] SMS to ${normalizedValue}: ${otp}`);
            }
        }

        await logSecurityEvent({
            action: 'Customer Contact Update OTP Sent',
            actor: user.email,
            actorType: 'customer',
            ipAddress: getClientIp(req),
            details: `${type} → ${type === 'email' ? maskEmail(normalizedValue) : maskPhone(normalizedValue)}`
        });

        res.status(200).json({
            success: true,
            message: `Verification code sent to ${type === 'email' ? maskEmail(normalizedValue) : maskPhone(normalizedValue)}.`,
            type,
            maskedDestination: type === 'email' ? maskEmail(normalizedValue) : maskPhone(normalizedValue),
            expiresInMinutes: 5,
            delivered: delivery.delivered
        });
    } catch (error) {
        console.error('Request Contact OTP Error:', error);
        res.status(500).json({ success: false, message: "Failed to send verification code. Please try again." });
    }
};

/* =======================================================
   ৮.২ ইমেইল / ফোন আপডেট — OTP যাচাই (Verify Contact OTP)
   ======================================================= */
exports.verifyContactUpdateOtp = async (req, res) => {
    try {
        const otp = normalizeProfileOtp(req.body.otp);

        if (!otp || otp.length !== 6) {
            return res.status(400).json({ success: false, message: "Please enter the 6-digit verification code." });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        if (!user.profileUpdateOtp || !user.profileUpdateOtpExpires || !user.profileUpdateType) {
            return res.status(400).json({
                success: false,
                message: "No pending verification request. Please request a new code."
            });
        }

        if (Date.now() > Number(user.profileUpdateOtpExpires)) {
            Object.assign(user, clearProfileUpdateOtpFields());
            await user.save();
            return res.status(400).json({ success: false, message: "Verification code expired. Please request a new one." });
        }

        if (user.profileUpdateOtp !== otp) {
            return res.status(400).json({ success: false, message: "Invalid verification code. Please try again." });
        }

        const updateType = user.profileUpdateType;
        let updatedValue = '';

        if (updateType === 'email' && user.pendingEmail) {
            user.email = user.pendingEmail;
            updatedValue = user.pendingEmail;
        } else if (updateType === 'mobile' && user.pendingMobile) {
            user.mobile = user.pendingMobile;
            user.phone = user.pendingMobile;
            updatedValue = user.pendingMobile;
        } else {
            return res.status(400).json({ success: false, message: "Pending update data is missing. Please start again." });
        }

        Object.assign(user, clearProfileUpdateOtpFields());
        await user.save();

        await logSecurityEvent({
            action: 'Customer Contact Updated',
            actor: updatedValue,
            actorType: 'customer',
            ipAddress: getClientIp(req),
            details: `${updateType} verified via OTP`
        });

        const safeUser = await User.findById(req.user.id).select('-password');

        res.status(200).json({
            success: true,
            message: updateType === 'email'
                ? "Email address updated successfully!"
                : "Phone number updated successfully!",
            type: updateType,
            user: safeUser
        });
    } catch (error) {
        console.error('Verify Contact OTP Error:', error);
        res.status(500).json({ success: false, message: "Server error during verification." });
    }
};
/* =======================================================
   ১১. ঠিকানা ম্যানেজমেন্ট (Addresses - Add / Update / Delete)
   ======================================================= */

// ১১.ক. সব ঠিকানা দেখা
exports.getAddresses = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('addresses');
        if (!user) return res.status(404).json({ success: false, message: "User not found." });
        res.status(200).json({ success: true, addresses: user.addresses || [] });
    } catch (error) {
        console.error("Get Addresses Error:", error);
        res.status(500).json({ success: false, message: "Failed to load addresses." });
    }
};

// ১১.খ. নতুন ঠিকানা যুক্ত করা
exports.addAddress = async (req, res) => {
    try {
        const parsed = parseSavedAddressPayload(req.body);
        if (parsed.error) {
            return res.status(parsed.error.status).json({
                success: false,
                message: parsed.error.message
            });
        }

        const { label, district, upazilaOrThana, fullAddress, phone, isDefault } = parsed.data;

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ success: false, message: "User not found." });

        const makeDefault = isDefault || user.addresses.length === 0;
        if (makeDefault) {
            user.addresses.forEach(addr => { addr.isDefault = false; });
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
        res.status(200).json({ success: true, message: "Address added successfully!", addresses: user.addresses });
    } catch (error) {
        console.error("Add Address Error:", error);
        res.status(500).json({ success: false, message: "Failed to add address." });
    }
};

// ১১.গ. ঠিকানা আপডেট করা
exports.updateAddress = async (req, res) => {
    try {
        const { addressId } = req.params;
        const parsed = parseSavedAddressPayload(req.body);
        if (parsed.error) {
            return res.status(parsed.error.status).json({
                success: false,
                message: parsed.error.message
            });
        }

        const { label, district, upazilaOrThana, fullAddress, phone, isDefault } = parsed.data;

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ success: false, message: "User not found." });

        const target = user.addresses.id(addressId);
        if (!target) return res.status(404).json({ success: false, message: "Address not found." });

        target.label = label;
        target.district = district;
        target.upazilaOrThana = upazilaOrThana;
        target.fullAddress = fullAddress;
        target.phone = phone;

        if (isDefault) {
            user.addresses.forEach(addr => { addr.isDefault = false; });
            target.isDefault = true;
            user.address = formatSavedAddressLine(target);
            syncUserProfileFromAddress(user, target);
        }

        await user.save();
        res.status(200).json({ success: true, message: "Address updated successfully!", addresses: user.addresses });
    } catch (error) {
        console.error("Update Address Error:", error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: error.message || "Invalid address data."
            });
        }
        res.status(500).json({ success: false, message: "Failed to update address." });
    }
};

// ১১.ঘ. ঠিকানা ডিলিট করা
exports.deleteAddress = async (req, res) => {
    try {
        const { addressId } = req.params;
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ success: false, message: "User not found." });

        const target = user.addresses.id(addressId);
        if (!target) return res.status(404).json({ success: false, message: "Address not found." });

        const wasDefault = target.isDefault;
        target.deleteOne();

        // ডিফল্ট মুছে ফেললে প্রথম ঠিকানাটিকে নতুন ডিফল্ট করা হবে
        if (wasDefault && user.addresses.length > 0) {
            user.addresses[0].isDefault = true;
            user.address = formatSavedAddressLine(user.addresses[0]);
            syncUserProfileFromAddress(user, user.addresses[0]);
        } else if (user.addresses.length === 0) {
            user.address = '';
        }

        await user.save();
        res.status(200).json({ success: true, message: "Address deleted successfully!", addresses: user.addresses });
    } catch (error) {
        console.error("Delete Address Error:", error);
        res.status(500).json({ success: false, message: "Failed to delete address." });
    }
};


/* =======================================================
   ১২. পয়েন্ট কনভার্সন (Loyalty Points → Wallet Balance)
   রেট: মাস্টার সেটিংস থেকে — 100 পয়েন্ট = pointsToTakaConversionRate Taka
   ======================================================= */
exports.convertPoints = async (req, res) => {
    try {
        const rewardSettings = await loadRewardSettings();
        const pointsToConvert = Number(req.body.points);
        const minPoints = rewardSettings.pointsConversionUnit || POINTS_CONVERSION_UNIT;

        if (!pointsToConvert || pointsToConvert <= 0) {
            return res.status(400).json({ success: false, message: "Please enter a valid number of points." });
        }
        if (pointsToConvert < minPoints) {
            return res.status(400).json({ success: false, message: `Minimum ${minPoints} points are required to convert.` });
        }
        if (pointsToConvert % minPoints !== 0) {
            return res.status(400).json({ success: false, message: `Points must be in multiples of ${minPoints}.` });
        }

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ success: false, message: "User not found." });

        if (user.loyaltyPoints < pointsToConvert) {
            return res.status(400).json({ success: false, message: `You only have ${user.loyaltyPoints} points.` });
        }

        const cashValue = calculatePointsCashValue(pointsToConvert, rewardSettings);
        if (cashValue <= 0) {
            return res.status(400).json({ success: false, message: "Point conversion is currently disabled or misconfigured." });
        }

        user.loyaltyPoints -= pointsToConvert;
        user.walletBalance += cashValue;
        user.walletHistory.unshift({
            type: 'conversion',
            amount: cashValue,
            note: `Converted ${pointsToConvert} points to wallet balance (${minPoints} pts = ৳${rewardSettings.pointsToTakaConversionRate})`
        });

        await user.save();

        res.status(200).json({
            success: true,
            message: `Successfully converted ${pointsToConvert} points to ৳${cashValue}!`,
            walletBalance: user.walletBalance,
            loyaltyPoints: user.loyaltyPoints,
            walletHistory: user.walletHistory,
            rewardSettings
        });
    } catch (error) {
        console.error("Convert Points Error:", error);
        res.status(500).json({ success: false, message: "Server error during points conversion." });
    }
};
