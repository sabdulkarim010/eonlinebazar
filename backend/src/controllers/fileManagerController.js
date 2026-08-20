/********************************************************************
 * Project: EonlineBazar
 * File: fileManagerController.js
 * Location: backend/src/controllers/fileManagerController.js
 * Author: Abdul Karim Sheikh
 * Description: Super Admin file manager — safe browse / read / write /
 *   create / delete inside the project root. Paths are normalized and
 *   confined to the repo; sensitive names (.env, .git, …) are blocked.
 ********************************************************************/

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

/** Directories skipped entirely while walking the tree. */
const EXCLUDED_DIR_NAMES = new Set([
    'node_modules',
    '.git',
    'dist',
    'build',
    '.next',
    'coverage',
    '.cache',
    '.turbo',
    '.vercel',
    '__pycache__'
]);

/** Basename patterns that must never be read, written, created, or deleted. */
const SENSITIVE_BASENAME_RE = /^(?:\.env(?:\..+)?|id_rsa|id_ed25519|.*\.(?:pem|key|p12|pfx))$/i;

const MAX_LIST_ENTRIES = 15000;
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB read/write cap
const MAX_SEARCH_RESULTS = 500;

function badRequest(message) {
    const err = new Error(message);
    err.statusCode = 400;
    return err;
}

function forbidden(message) {
    const err = new Error(message);
    err.statusCode = 403;
    return err;
}

function notFound(message) {
    const err = new Error(message);
    err.statusCode = 404;
    return err;
}

function sendError(res, err, fallbackMessage) {
    const status = err.statusCode || 500;
    if (status >= 500) {
        console.error('File Manager Error:', err);
    }
    return res.status(status).json({
        success: false,
        message: status >= 500 ? fallbackMessage : err.message
    });
}

function toPosix(relPath) {
    return String(relPath || '').split(path.sep).join('/');
}

function isExcludedDirName(name) {
    return EXCLUDED_DIR_NAMES.has(name);
}

function isSensitiveBasename(name) {
    if (!name) return false;
    if (name === '.env' || name.startsWith('.env.')) return true;
    return SENSITIVE_BASENAME_RE.test(name);
}

function pathHasSensitiveSegment(relPath) {
    const parts = toPosix(relPath).split('/').filter(Boolean);
    return parts.some((segment) => isSensitiveBasename(segment) || isExcludedDirName(segment));
}

/**
 * Resolve a user-supplied relative path inside PROJECT_ROOT.
 * Uses path.normalize + path.resolve and rejects traversal / absolute escapes.
 */
function resolveSafePath(inputPath, { allowRoot = false } = {}) {
    if (inputPath == null || String(inputPath).trim() === '') {
        if (allowRoot) {
            return { absolute: PROJECT_ROOT, relative: '', relativePosix: '' };
        }
        throw badRequest('Path is required.');
    }

    const raw = String(inputPath);
    if (raw.includes('\0')) {
        throw badRequest('Invalid path.');
    }

    // Strip leading slashes/backslashes so resolve never treats it as absolute (esp. on Windows).
    const stripped = raw.replace(/^[/\\]+/, '');
    const normalized = path.normalize(stripped);
    const absolute = path.resolve(PROJECT_ROOT, normalized);
    const relative = path.relative(PROJECT_ROOT, absolute);

    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw forbidden('Access denied: path is outside the project root.');
    }

    if (!allowRoot && (relative === '' || relative === '.')) {
        throw forbidden('Access denied: the project root cannot be targeted for this operation.');
    }

    return {
        absolute,
        relative: relative === '.' ? '' : relative,
        relativePosix: toPosix(relative === '.' ? '' : relative)
    };
}

function assertNotSensitive(relPosix, action) {
    if (pathHasSensitiveSegment(relPosix)) {
        throw forbidden(`Access denied: sensitive or excluded path cannot be ${action}.`);
    }
}

function looksBinary(buffer) {
    const sample = buffer.subarray(0, Math.min(buffer.length, 8000));
    for (let i = 0; i < sample.length; i += 1) {
        if (sample[i] === 0) return true;
    }
    return false;
}

async function walkTree(absDir, relDir, searchLower, acc, counters) {
    if (counters.entries >= MAX_LIST_ENTRIES) return;

    let dirents;
    try {
        dirents = await fsp.readdir(absDir, { withFileTypes: true });
    } catch {
        return;
    }

    dirents.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
    });

    for (const dirent of dirents) {
        if (counters.entries >= MAX_LIST_ENTRIES) break;

        const name = dirent.name;
        if (isExcludedDirName(name) || isSensitiveBasename(name)) continue;

        const childRel = relDir ? path.join(relDir, name) : name;
        const childRelPosix = toPosix(childRel);
        const childAbs = path.join(absDir, name);

        if (dirent.isDirectory()) {
            counters.entries += 1;
            const node = {
                name,
                path: childRelPosix,
                type: 'folder',
                extension: '',
                size: 0,
                children: []
            };

            if (!searchLower) {
                acc.push(node);
                await walkTree(childAbs, childRel, searchLower, node.children, counters);
            } else {
                // When searching, still descend; folders matching the query are included flat.
                if (name.toLowerCase().includes(searchLower) && counters.matches < MAX_SEARCH_RESULTS) {
                    counters.matches += 1;
                    acc.push({
                        name,
                        path: childRelPosix,
                        type: 'folder',
                        extension: '',
                        size: 0
                    });
                }
                await walkTree(childAbs, childRel, searchLower, acc, counters);
            }
            continue;
        }

        if (!dirent.isFile()) continue;

        counters.entries += 1;

        let size = 0;
        try {
            const st = await fsp.stat(childAbs);
            size = st.size;
        } catch {
            size = 0;
        }

        const ext = path.extname(name);
        const entry = {
            name,
            path: childRelPosix,
            type: 'file',
            extension: ext,
            size
        };

        if (searchLower) {
            if (
                (name.toLowerCase().includes(searchLower) || childRelPosix.toLowerCase().includes(searchLower))
                && counters.matches < MAX_SEARCH_RESULTS
            ) {
                counters.matches += 1;
                acc.push(entry);
            }
        } else {
            acc.push(entry);
        }
    }
}

/**
 * GET /api/admin/files
 * Optional ?search=filename — flat filtered list; otherwise a folder tree.
 */
const listFiles = async (req, res) => {
    try {
        const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
        const searchLower = search ? search.toLowerCase() : '';
        const results = [];
        const counters = { entries: 0, matches: 0 };

        await walkTree(PROJECT_ROOT, '', searchLower, results, counters);

        if (searchLower) {
            return res.json({
                success: true,
                search,
                count: results.length,
                truncated: counters.entries >= MAX_LIST_ENTRIES || counters.matches >= MAX_SEARCH_RESULTS,
                data: results
            });
        }

        return res.json({
            success: true,
            root: '.',
            count: counters.entries,
            truncated: counters.entries >= MAX_LIST_ENTRIES,
            data: {
                name: path.basename(PROJECT_ROOT) || 'project',
                path: '',
                type: 'folder',
                extension: '',
                size: 0,
                children: results
            }
        });
    } catch (err) {
        return sendError(res, err, 'Failed to list project files.');
    }
};

/**
 * GET /api/admin/files/read?path=...
 */
const readFileContent = async (req, res) => {
    try {
        const { absolute, relativePosix } = resolveSafePath(req.query.path);
        assertNotSensitive(relativePosix, 'read');

        let st;
        try {
            st = await fsp.stat(absolute);
        } catch {
            throw notFound('File not found.');
        }

        if (!st.isFile()) {
            throw badRequest('Path is not a file.');
        }

        if (st.size > MAX_FILE_BYTES) {
            throw badRequest(`File is too large to read (max ${MAX_FILE_BYTES} bytes).`);
        }

        const buffer = await fsp.readFile(absolute);
        if (looksBinary(buffer)) {
            throw badRequest('Binary files cannot be opened in the file manager.');
        }

        return res.json({
            success: true,
            data: {
                path: relativePosix,
                name: path.basename(absolute),
                extension: path.extname(absolute),
                size: st.size,
                content: buffer.toString('utf8')
            }
        });
    } catch (err) {
        return sendError(res, err, 'Failed to read file.');
    }
};

/**
 * POST /api/admin/files/save
 * Body: { path, content }
 */
const saveFileContent = async (req, res) => {
    try {
        const targetPath = req.body && req.body.path;
        const content = req.body && req.body.content;

        if (typeof content !== 'string') {
            throw badRequest('Content must be a string.');
        }

        if (Buffer.byteLength(content, 'utf8') > MAX_FILE_BYTES) {
            throw badRequest(`Content exceeds the maximum allowed size (${MAX_FILE_BYTES} bytes).`);
        }

        const { absolute, relativePosix } = resolveSafePath(targetPath);
        assertNotSensitive(relativePosix, 'written');

        let st;
        try {
            st = await fsp.stat(absolute);
        } catch {
            throw notFound('File not found. Use create to add a new file.');
        }

        if (!st.isFile()) {
            throw badRequest('Path is not a file.');
        }

        await fsp.writeFile(absolute, content, 'utf8');

        return res.json({
            success: true,
            message: 'File saved successfully.',
            data: {
                path: relativePosix,
                name: path.basename(absolute),
                size: Buffer.byteLength(content, 'utf8')
            }
        });
    } catch (err) {
        return sendError(res, err, 'Failed to save file.');
    }
};

/**
 * POST /api/admin/files/create
 * Body: { path, type: 'file'|'folder', content? }
 */
const createEntry = async (req, res) => {
    try {
        const targetPath = req.body && req.body.path;
        const type = String((req.body && req.body.type) || 'file').toLowerCase();
        const content = (req.body && req.body.content) != null ? String(req.body.content) : '';

        if (type !== 'file' && type !== 'folder') {
            throw badRequest('Type must be "file" or "folder".');
        }

        if (type === 'file' && Buffer.byteLength(content, 'utf8') > MAX_FILE_BYTES) {
            throw badRequest(`Content exceeds the maximum allowed size (${MAX_FILE_BYTES} bytes).`);
        }

        const { absolute, relativePosix } = resolveSafePath(targetPath);
        assertNotSensitive(relativePosix, 'created');

        // Parent must exist and stay inside the project.
        const parentAbs = path.dirname(absolute);
        const parentRel = path.relative(PROJECT_ROOT, parentAbs);
        if (parentRel.startsWith('..') || path.isAbsolute(parentRel)) {
            throw forbidden('Access denied: parent path is outside the project root.');
        }

        try {
            const parentStat = await fsp.stat(parentAbs);
            if (!parentStat.isDirectory()) {
                throw badRequest('Parent path is not a directory.');
            }
        } catch (err) {
            if (err.statusCode) throw err;
            throw badRequest('Parent directory does not exist.');
        }

        try {
            await fsp.access(absolute, fs.constants.F_OK);
            throw badRequest('A file or folder already exists at this path.');
        } catch (err) {
            if (err.statusCode) throw err;
            // ENOENT → available
        }

        if (type === 'folder') {
            await fsp.mkdir(absolute);
        } else {
            await fsp.writeFile(absolute, content, { encoding: 'utf8', flag: 'wx' });
        }

        return res.status(201).json({
            success: true,
            message: type === 'folder' ? 'Folder created successfully.' : 'File created successfully.',
            data: {
                path: relativePosix,
                name: path.basename(absolute),
                type,
                extension: type === 'file' ? path.extname(absolute) : '',
                size: type === 'file' ? Buffer.byteLength(content, 'utf8') : 0
            }
        });
    } catch (err) {
        if (err && err.code === 'EEXIST') {
            return res.status(400).json({ success: false, message: 'A file or folder already exists at this path.' });
        }
        return sendError(res, err, 'Failed to create file or folder.');
    }
};

/**
 * DELETE /api/admin/files/delete
 * Body: { path, adminPassword } — password checked against the Super Admin hash.
 */
const deleteEntry = async (req, res) => {
    try {
        const targetPath = req.body && req.body.path;
        const adminPassword = req.body && req.body.adminPassword;

        if (!adminPassword || typeof adminPassword !== 'string') {
            throw badRequest('adminPassword is required to delete files.');
        }

        const account = req.adminAccount;
        if (!account || typeof account.verifyPassword !== 'function') {
            throw forbidden('Super Admin session could not be verified.');
        }

        const passwordOk = await account.verifyPassword(adminPassword);
        if (!passwordOk) {
            return res.status(401).json({
                success: false,
                message: 'Incorrect admin password. Delete aborted.'
            });
        }

        const { absolute, relativePosix } = resolveSafePath(targetPath, { allowRoot: false });

        // Never allow deleting the project root (also blocked by allowRoot: false).
        if (absolute === PROJECT_ROOT || relativePosix === '') {
            throw forbidden('Access denied: the project root cannot be deleted.');
        }

        assertNotSensitive(relativePosix, 'deleted');

        // Extra hard lock: never delete OS / drive roots if somehow resolved there.
        const parsed = path.parse(absolute);
        if (parsed.root && path.resolve(absolute) === path.resolve(parsed.root)) {
            throw forbidden('Access denied: system root paths cannot be deleted.');
        }

        let st;
        try {
            st = await fsp.stat(absolute);
        } catch {
            throw notFound('File or folder not found.');
        }

        if (st.isDirectory()) {
            await fsp.rm(absolute, { recursive: true, force: false });
        } else if (st.isFile()) {
            await fsp.unlink(absolute);
        } else {
            throw badRequest('Unsupported file system entry type.');
        }

        return res.json({
            success: true,
            message: st.isDirectory() ? 'Folder deleted successfully.' : 'File deleted successfully.',
            data: { path: relativePosix, type: st.isDirectory() ? 'folder' : 'file' }
        });
    } catch (err) {
        return sendError(res, err, 'Failed to delete file or folder.');
    }
};

module.exports = {
    listFiles,
    readFileContent,
    saveFileContent,
    createEntry,
    deleteEntry,
    // Exported for unit tests / reuse
    PROJECT_ROOT,
    resolveSafePath
};
