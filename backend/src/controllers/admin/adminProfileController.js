/**
 * EonlineBazar — Admin Profile Controller
 * Extracted from: controllers/adminController.js
 * Routes that use this: routes/adminRoutes.js
 *
 * When adding new endpoints:
 * 1. Add handler here
 * 2. Export from barrel (original controller file)
 * 3. Add route in routes/[file].routes.js
 */

const Admin = require('../../models/admin');
const Employee = require('../../models/employee');
const AdminSession = require('../../models/adminSession');
const { ROLES } = require('../../config/permissions');
const { routedRead } = require('../../services/readRouter');
const {
    getAdminWithEmployeeData: getAdminWithEmployeeDataPg,
    linkEmployeeToAdmin: linkEmployeeToAdminPg,
    buildAdminEmployeeProfileShape
} = require('../../repositories/adminRepository');
const { dualWrite } = require('../../services/dualWriteService');
const {
    fetchSecurityLogsPage,
    countSecurityLogs
} = require('../../services/securityAuditReadService');
const Coupon = require('../../models/coupon');
const cloudinary = require('cloudinary').v2;
const { logSecurityEvent, getClientIp } = require('../../utils/securityLogger');
const { adminDualWrite, mirrorAdminUpdate } = require('../../utils/adminDualWriteHelpers');
const { getApplicationNow } = require('../../utils/applicationTime');

function getEmployeeRepository() {
    return require('../../repositories/employeeRepository');
}

function mapHttpLinkError(err, res) {
    if (err.code === 'NOT_FOUND') {
        return res.status(404).json({ success: false, message: err.message });
    }
    if (err.code === 'ALREADY_LINKED') {
        return res.status(409).json({ success: false, message: err.message });
    }
    return null;
}

async function resolveLinkedEmployee(admin) {
    if (!admin) return null;

    let employee = null;
    if (admin.employeeRef) {
        employee = await Employee.findById(admin.employeeRef);
    }
    if (!employee) {
        employee = await Employee.findOne({ linkedAdminId: String(admin._id) });
    }
    return employee;
}

async function getAdminWithEmployeeDataMongo(adminId) {
    const admin = await Admin.findById(adminId);
    if (!admin) return null;

    const employee = await resolveLinkedEmployee(admin);
    return buildAdminEmployeeProfileShape(
        {
            id: String(admin._id),
            legacyId: String(admin._id),
            displayName: admin.displayName,
            name: admin.name,
            email: admin.email,
            username: admin.username,
            role: admin.role,
            image: admin.image
        },
        employee
            ? {
                id: String(employee._id),
                legacyId: String(employee._id),
                fullName: employee.fullName,
                photo: employee.photo,
                employeeId: employee.employeeId
            }
            : null
    );
}

async function syncLinkedEmployeePhoto(admin, imageUrl, publicId = '') {
    const employee = await resolveLinkedEmployee(admin);
    if (!employee || !imageUrl) return;

    employee.photo = imageUrl;
    if (publicId) employee.photoPublicId = publicId;

    await dualWrite(
        () => employee.save(),
        async (saved) => {
            const repo = getEmployeeRepository();
            const pgRow = await repo.findByLegacyId(String(saved._id));
            if (!pgRow) return;
            await repo.update(pgRow.id, {
                photo: saved.photo,
                photoPublicId: saved.photoPublicId
            });
        },
        {
            model: 'Employee',
            operation: 'update',
            mongoId: (saved) => String(saved._id)
        }
    );
}

async function syncLinkedAdminPhoto(employee, imageUrl) {
    if (!employee?.linkedAdminId || !imageUrl) return;

    await adminDualWrite(
        () => Admin.findByIdAndUpdate(
            employee.linkedAdminId,
            { image: imageUrl },
            { returnDocument: 'after' }
        ),
        (updated) => mirrorAdminUpdate(updated, { operation: 'syncLinkedAdminPhoto' }),
        {
            operation: 'syncLinkedAdminPhoto',
            mongoId: String(employee.linkedAdminId)
        }
    );
}

async function syncLinkedEmployeeName(admin, displayName) {
    const employee = await resolveLinkedEmployee(admin);
    if (!employee || !displayName) return;

    employee.fullName = String(displayName).trim();
    await dualWrite(
        () => employee.save(),
        async (saved) => {
            const repo = getEmployeeRepository();
            const pgRow = await repo.findByLegacyId(String(saved._id));
            if (!pgRow) return;
            await repo.update(pgRow.id, { fullName: saved.fullName });
        },
        {
            model: 'Employee',
            operation: 'update',
            mongoId: (saved) => String(saved._id)
        }
    );
}

// ==============================================================
// ৩. প্রোফাইল ছবি আপলোড ফাংশন (Cloudinary) - 🌟 ওল্ড ইমেজ ডিলিট ফিক্সসহ
// ==============================================================
const updateProfilePic = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "কোনো ছবি সিলেক্ট করা হয়নি!" });
        }

        // 🌟 ফিক্স: নতুন ছবি আপলোডের আগে পুরোনো ছবি ক্লাউডিনারি থেকে ডিলিট করা
        // (স্টাফ অ্যাকাউন্টও নিজের ছবি বদলাতে পারে — তাই লগইন করা ইউজারনেম ব্যবহার)
        const currentUsername = req.admin?.username;
        const existingAdmin = await Admin.findOne({ username: currentUsername });
        if (existingAdmin && existingAdmin.image) {
            const oldImageUrl = existingAdmin.image;
            if (oldImageUrl.includes('cloudinary.com')) {
                try {
                    const urlParts = oldImageUrl.split('/');
                    const filename = urlParts[urlParts.length - 1].split('.')[0];        
                    const folder = urlParts[urlParts.length - 2];      
                    const publicId = `${folder}/${filename}`;
                    await cloudinary.uploader.destroy(publicId);
                } catch (cloudinaryErr) {
                    console.error("Old Admin Image Delete Error:", cloudinaryErr);
                }
            }
        }

        // নতুন ছবি ক্লাউডিনারিতে আপলোড করা
        const stream = cloudinary.uploader.upload_stream(
            { folder: 'EonlineBazar_Admin' }, 
            async (error, result) => {
                if (error) {
                    console.error("Cloudinary Error:", error);
                    return res.status(500).json({ success: false, message: "ছবি আপলোডে এরর!" });
                }

                // ডাটাবেজে নতুন ছবির লিংক আপডেট করা
                const updatedAdmin = await adminDualWrite(
                    () => Admin.findOneAndUpdate(
                        { username: currentUsername },
                        { image: result.secure_url },
                        { returnDocument: 'after' }
                    ),
                    (saved) => mirrorAdminUpdate(saved, { operation: 'updateProfilePic' }),
                    {
                        operation: 'updateProfilePic',
                        mongoId: (saved) => String(saved?._id)
                    }
                );

                if (!updatedAdmin) {
                    return res.status(404).json({ success: false, message: "অ্যাডমিন অ্যাকাউন্ট পাওয়া যায়নি।" });
                }

                await syncLinkedEmployeePhoto(updatedAdmin, result.secure_url, result.public_id);

                res.status(200).json({
                    success: true,
                    imageUrl: result.secure_url,
                    photoUpdated: true,
                    message: "প্রোফাইল ছবি সফলভাবে আপডেট হয়েছে!"
                });
            }
        );

        stream.end(req.file.buffer);

    } catch (error) {
        console.error("Profile Upload Error:", error);
        res.status(500).json({ success: false, message: "সার্ভার এরর" });
    }
};

// ==============================================================
// ৪. ডাটাবেজ থেকে অ্যাডমিন প্রোফাইল ছবি নিয়ে আসার ফাংশন
// ==============================================================
const getAdminProfileFull = async (req, res) => {
    try {
        const adminId = String(req.adminAccount?._id || req.admin?.id || '');
        if (!adminId) {
            return res.status(401).json({ success: false, message: 'Admin session could not be verified.' });
        }

        const data = await routedRead(
            'admin',
            () => getAdminWithEmployeeDataMongo(adminId),
            () => getAdminWithEmployeeDataPg(adminId)
        );

        if (!data) {
            return res.status(404).json({ success: false, message: 'Admin not found.' });
        }

        res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('Get Admin Profile Full Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load admin profile.' });
    }
};

const linkAdminEmployee = async (req, res) => {
    try {
        const account = req.adminAccount;
        if (!account?.isSuperAdmin()) {
            return res.status(403).json({
                success: false,
                message: 'Only Super Admin can link employee records.'
            });
        }

        const { employeeId } = req.body || {};
        if (!employeeId) {
            return res.status(400).json({ success: false, message: 'employeeId is required.' });
        }

        const adminId = String(account._id);
        const employee = await Employee.findOne({
            $or: [
                { _id: employeeId },
                { employeeId: String(employeeId).trim() }
            ]
        });

        if (!employee) {
            return res.status(404).json({ success: false, message: 'Employee not found.' });
        }

        if (employee.status !== 'active') {
            return res.status(400).json({ success: false, message: 'Only active employees can be linked.' });
        }

        if (employee.linkedAdminId && employee.linkedAdminId !== adminId) {
            return res.status(409).json({
                success: false,
                message: 'Employee is already linked to another admin account.'
            });
        }

        if (employee.linkedAdminId === adminId && account.employeeRef === String(employee._id)) {
            const existing = await routedRead(
                'admin',
                () => getAdminWithEmployeeDataMongo(adminId),
                () => getAdminWithEmployeeDataPg(adminId)
            );
            return res.status(200).json({
                success: true,
                message: 'Employee record is already linked.',
                data: existing
            });
        }

        const previousEmployee = await Employee.findOne({
            linkedAdminId: adminId,
            _id: { $ne: employee._id }
        });
        if (previousEmployee) {
            previousEmployee.linkedAdminId = null;
            await dualWrite(
                () => previousEmployee.save(),
                async (saved) => {
                    const repo = getEmployeeRepository();
                    const pgRow = await repo.findByLegacyId(String(saved._id));
                    if (pgRow) await repo.unlinkAdminAccount(pgRow.id).catch(() => {});
                },
                {
                    model: 'Employee',
                    operation: 'update',
                    mongoId: (saved) => String(saved._id)
                }
            );
        }

        employee.linkedAdminId = adminId;
        account.employeeRef = String(employee._id);

        await dualWrite(
            () => employee.save(),
            async (saved) => {
                const repo = getEmployeeRepository();
                const pgEmployee = await repo.findByLegacyId(String(saved._id));
                const pgAdminId = await require('../../utils/hrmDualWriteHelpers')
                    .resolvePostgresAdminId(adminId);
                if (pgEmployee && pgAdminId && pgEmployee.linkedAdminId !== pgAdminId) {
                    await repo.linkAdminAccount(pgEmployee.id, pgAdminId);
                }
            },
            {
                model: 'Employee',
                operation: 'update',
                mongoId: (saved) => String(saved._id)
            }
        );

        await adminDualWrite(
            () => account.save(),
            (saved) => mirrorAdminUpdate(saved, { operation: 'linkAdminEmployee' }),
            {
                operation: 'linkAdminEmployee',
                mongoId: (saved) => String(saved._id)
            }
        );

        const data = await routedRead(
            'admin',
            () => getAdminWithEmployeeDataMongo(adminId),
            () => getAdminWithEmployeeDataPg(adminId)
        );

        await logSecurityEvent({
            action: 'Admin Employee Link Updated',
            actor: account.username,
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: `Linked to ${employee.employeeId} — ${employee.fullName}`,
            resourceType: 'employee',
            resourceId: String(employee._id)
        });

        res.status(200).json({
            success: true,
            message: 'Employee record linked successfully.',
            data
        });
    } catch (error) {
        const mapped = mapHttpLinkError(error, res);
        if (mapped) return mapped;
        console.error('Link Admin Employee Error:', error);
        res.status(500).json({ success: false, message: 'Failed to link employee record.' });
    }
};

const getAdminProfile = async (req, res) => {
    try {
        // লগইন করা অ্যাকাউন্টের নিজের প্রোফাইল (সুপার অ্যাডমিন বা স্টাফ)
        const admin = await Admin.findOne({ username: req.admin?.username });
        
        if (!admin) {
            return res.status(404).json({ success: false, message: "অ্যাডমিন পাওয়া যায়নি।" });
        }

        res.status(200).json({
            success: true,
            image: admin.image,
            username: admin.username,
            name: admin.name || admin.displayName || admin.username,
            role: admin.role,
            permissions: Array.isArray(admin.permissions) ? admin.permissions : []
        });
    } catch (error) {
        console.error("Get Profile Error:", error);
        res.status(500).json({ success: false, message: "সার্ভার এরর" });
    }
};

// ==============================================================
// ৯. সিকিউরিটি লগস (অ্যাডমিন প্যানেল)
// ==============================================================
const getSecurityLogs = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);
        const skip = (page - 1) * limit;

        const [logs, total] = await Promise.all([
            fetchSecurityLogsPage({ skip, limit, filter: {} }),
            countSecurityLogs({})
        ]);

        const data = logs.map(log => ({
            _id: log._id,
            action: log.action,
            actor: log.actor,
            actorType: log.actorType,
            ipAddress: log.ipAddress,
            details: log.details,
            resourceType: log.resourceType || null,
            resourceId: log.resourceId || null,
            timestamp: log.createdAt
        }));

        res.status(200).json({
            success: true,
            data,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit) || 1
            }
        });
    } catch (error) {
        console.error('Get Security Logs Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch security logs.' });
    }
};

// ==============================================================
// ১০. অ্যাডমিন টোকেন ভেরিফাই
// ==============================================================
const verifyAdminToken = (req, res) => {
    res.status(200).json({ success: true, admin: req.admin });
};

// ==============================================================
// ১১.১. অ্যাডমিন প্রোফাইল আপডেট (ডিসপ্লে নেম, ইউজারনেম, পাসওয়ার্ড)
// ==============================================================
const updateAdminProfile = async (req, res) => {
    try {
        const { currentPassword, username, newPassword, displayName, email } = req.body;

        if (!currentPassword) {
            return res.status(400).json({ success: false, message: 'Current password is required.' });
        }

        const admin = await Admin.findOne({ username: req.admin?.username || 'admin' });
        if (!admin) {
            return res.status(404).json({ success: false, message: 'Admin not found.' });
        }

        const currentPasswordOk = await admin.verifyPassword(currentPassword);
        if (!currentPasswordOk) {
            await logSecurityEvent({
                action: 'Admin Profile Update Failed',
                actor: admin.username,
                actorType: 'admin',
                ipAddress: getClientIp(req),
                details: 'Incorrect current password'
            });
            return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
        }

        const previousUsername = admin.username;
        let usernameChanged = false;

        if (username && username !== admin.username) {
            const exists = await Admin.findOne({ username, _id: { $ne: admin._id } });
            if (exists) {
                return res.status(400).json({ success: false, message: 'Username already taken.' });
            }
            admin.username = String(username).trim();
            usernameChanged = true;
        }

        if (newPassword) {
            if (String(newPassword).length < 6) {
                return res.status(400).json({ success: false, message: 'New password must be at least 6 characters.' });
            }
            // মডেলের pre-save হুক এটিকে bcrypt হ্যাশে রূপান্তর করবে
            admin.password = String(newPassword);
        }

        if (displayName !== undefined) {
            admin.displayName = String(displayName).trim();
            if (!admin.isSuperAdmin()) admin.name = admin.displayName;
        }

        if (email !== undefined) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (email && !emailRegex.test(email)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid email address format.'
                });
            }
            admin.email = String(email).toLowerCase().trim();
        }

        await adminDualWrite(
            () => admin.save(),
            (saved) => mirrorAdminUpdate(saved, {
                plainPassword: newPassword ? String(newPassword) : undefined,
                operation: 'updateAdminProfile'
            }),
            {
                operation: 'updateAdminProfile',
                mongoId: (saved) => String(saved._id)
            }
        );

        if (displayName !== undefined && admin.isSuperAdmin()) {
            await syncLinkedEmployeeName(admin, admin.displayName);
        }

        // ইউজারনেম বা পাসওয়ার্ড বদলালে পুরোনো টোকেন/সেশন আর বৈধ নয় —
        // সব ডিভাইস সাইন-আউট করে ফ্রন্টএন্ডকে রি-লগইন করতে বলা হয়।
        const requireRelogin = usernameChanged || !!newPassword;
        if (requireRelogin) {
            await AdminSession.deleteMany({ adminUsername: previousUsername });
        }

        await logSecurityEvent({
            action: 'Admin Profile Updated',
            actor: admin.username,
            actorType: 'admin',
            ipAddress: getClientIp(req),
            details: 'Display name, username, or password changed'
        });

        const safe = admin.toObject();
        delete safe.password;

        res.status(200).json({
            success: true,
            message: requireRelogin
                ? 'Profile updated. Please sign in again with your new credentials.'
                : 'Admin profile updated successfully.',
            requireRelogin,
            data: safe
        });
    } catch (error) {
        console.error('Update Admin Profile Error:', error);
        res.status(500).json({ success: false, message: 'Failed to update admin profile.' });
    }
};

// ==============================================================
// Global admin "Sync Data" — flush expired coupons + return fresh catalog state
// ==============================================================
const syncAdminData = async (req, res) => {
    try {
        const now = getApplicationNow();

        // Automatically shift outdated coupons before returning synced state
        await Coupon.expireDueCoupons(now);

        const rawCoupons = await Coupon.find().sort({ createdAt: -1 }).lean();
        const coupons = rawCoupons.map((coupon) => ({
            ...coupon,
            displayStatus: Coupon.deriveDisplayStatus(coupon, now)
        }));

        res.status(200).json({
            success: true,
            message: 'Data synchronized successfully.',
            data: { coupons }
        });
    } catch (error) {
        console.error('Admin Sync Error:', error);
        res.status(500).json({ success: false, message: 'Failed to synchronize admin data.' });
    }
};

const aiProductAssist = async (req, res) => {
    try {
        const { productName, additionalContext } = req.body;

        if (!productName || productName.trim().length < 2) {
            return res.status(400).json({
                success: false,
                message: 'Product name is required'
            });
        }

        if (!process.env.ANTHROPIC_API_KEY) {
            return res.status(503).json({
                success: false,
                message: 'AI service not configured'
            });
        }

        const prompt = `You are a product content writer for EOnlineBazar, 
a Bangladesh e-commerce store. Generate product content for:

Product Name: "${productName}"
${additionalContext ? 'Additional context: ' + additionalContext : ''}

Respond with ONLY a valid JSON object (no markdown, no backticks):
{
  "shortDescription": "One sentence description under 160 chars",
  "detailedDescription": "2-3 paragraph detailed description",
  "highlights": ["highlight 1", "highlight 2", "highlight 3", "highlight 4"],
  "suggestedCategory": "one of: Kids Fashion, Health & Beauty, Fashion & Apparel, Grocery, Electronics, Home & Living",
  "suggestedPriceRange": { "min": 0, "max": 0 },
  "keywords": ["keyword1", "keyword2", "keyword3"]
}`;

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 1000,
                messages: [{ role: 'user', content: prompt }]
            })
        });

        if (!response.ok) {
            return res.status(502).json({
                success: false,
                message: 'AI service unavailable'
            });
        }

        const data = await response.json();
        const text = data.content?.[0]?.text || '{}';

        let parsed;
        try {
            parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
        } catch {
            return res.status(500).json({
                success: false,
                message: 'Could not parse AI response'
            });
        }

        res.json({ success: true, data: parsed });
    } catch (err) {
        console.error('AI Product Assist Error:', err);
        res.status(500).json({ success: false, message: 'AI assist failed' });
    }
};

module.exports = {
    updateProfilePic,
    getAdminProfile,
    getAdminProfileFull,
    linkAdminEmployee,
    getSecurityLogs,
    verifyAdminToken,
    updateAdminProfile,
    syncAdminData,
    aiProductAssist,
    getAdminWithEmployeeDataMongo,
    resolveLinkedEmployee,
    syncLinkedAdminPhoto
};
