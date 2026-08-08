const { v2: cloudinary } = require('cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const MAX_BASE64_DECODED_BYTES = 3 * 1024 * 1024; // 3MB

/**
 * Allowlist for attachment URLs stored on messages.
 * Data URLs are never permitted.
 */
function isAllowedAttachmentUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (url.startsWith('data:')) return false;

  const allowed = [
    'res.cloudinary.com',
    'your-s3-bucket.amazonaws.com',
  ];

  // Optional extra hosts from env (comma-separated)
  if (process.env.ALLOWED_ATTACHMENT_HOSTS) {
    process.env.ALLOWED_ATTACHMENT_HOSTS.split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((h) => allowed.push(h));
  }

  try {
    const { hostname } = new URL(url);
    return allowed.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`) || hostname.endsWith(domain));
  } catch {
    return false;
  }
}

function assertNoDataUrlStorage(input) {
  if (typeof input === 'string' && input.startsWith('data:')) {
    throw new Error(
      'Data URL storage is not permitted. Use multipart upload.'
    );
  }
}

/**
 * Upload a chat image buffer to Cloudinary.
 * @param {Buffer} fileBuffer
 * @param {string} mimeType
 * @param {string} roomId
 * @returns {Promise<{ url, thumbnail_url, public_id, bytes, format }>}
 */
async function uploadChatImage(fileBuffer, mimeType, roomId) {
  if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
    throw new Error('Invalid file buffer');
  }
  if (!roomId) {
    throw new Error('roomId is required');
  }

  // Cloudinary upload API accepts a temporary data URI from the buffer;
  // the stored/returned URL is always a https Cloudinary URL, never a data: URL.
  const dataUri = `data:${mimeType || 'image/jpeg'};base64,${fileBuffer.toString('base64')}`;

  const result = await cloudinary.uploader.upload(dataUri, {
    folder: `chat-attachments/${roomId}`,
    resource_type: 'image',
    transformation: [
      { width: 1200, quality: 'auto', fetch_format: 'auto' },
    ],
  });

  const thumbnail_url = cloudinary.url(result.public_id, {
    width: 200,
    crop: 'scale',
    quality: 'auto',
    fetch_format: 'auto',
    secure: true,
  });

  return {
    url: result.secure_url || result.url,
    thumbnail_url,
    public_id: result.public_id,
    bytes: result.bytes,
    format: result.format,
  };
}

/**
 * Parse a base64 string (optionally data-URI prefixed) and upload as buffer.
 * Rejects storing data: URLs; max decoded size 3MB.
 * @param {string} base64String
 * @param {string} roomId
 */
async function uploadFromBase64(base64String, roomId) {
  if (!base64String || typeof base64String !== 'string') {
    throw new Error('base64 string is required');
  }

  // Do not accept data: URLs as a storage/attachment path — parse then upload via buffer.
  // If the entire payload is meant to be stored as-is (starts with data:), reject.
  // Callers that only send raw base64 (no data: prefix) are fine.
  // Callers that send data:image/...;base64,XXX are parsed to a buffer and uploaded
  // via multipart-equivalent Cloudinary upload — they are not stored as data URLs.

  let mimeType = 'image/jpeg';
  let base64Data = base64String;

  const match = base64String.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    mimeType = match[1];
    base64Data = match[2];
  } else if (base64String.startsWith('data:')) {
    assertNoDataUrlStorage(base64String);
  } else if (base64String.includes(',')) {
    const parts = base64String.split(',');
    base64Data = parts[parts.length - 1];
  }

  const fileBuffer = Buffer.from(base64Data, 'base64');
  if (!fileBuffer.length) {
    throw new Error('Invalid base64 payload');
  }
  if (fileBuffer.length > MAX_BASE64_DECODED_BYTES) {
    throw new Error('Decoded file exceeds 3MB limit');
  }

  return uploadChatImage(fileBuffer, mimeType, roomId);
}

/**
 * Delete an image from Cloudinary by public_id.
 */
async function deleteChatImage(public_id) {
  if (!public_id) {
    throw new Error('public_id is required');
  }
  return cloudinary.uploader.destroy(public_id);
}

/**
 * Validate attachments array from client payloads.
 * Rejects data: URLs and non-allowlisted hosts.
 */
function sanitizeAttachments(attachments = []) {
  if (!Array.isArray(attachments)) return [];
  if (attachments.length > 5) {
    throw new Error('Maximum 5 attachments per message');
  }

  return attachments.map((att) => {
    const url = typeof att === 'string' ? att : att?.url;
    assertNoDataUrlStorage(url);
    if (!isAllowedAttachmentUrl(url)) {
      throw new Error(
        'Attachment URL is not allowed. Upload via multipart first.'
      );
    }
    if (typeof att === 'string') {
      return { url: att, type: 'IMAGE' };
    }
    return {
      url: att.url,
      thumbnail_url: att.thumbnail_url || '',
      type: att.type || 'IMAGE',
      filename: att.filename || att.name || '',
      size: att.size || 0,
      public_id: att.public_id || '',
    };
  });
}

module.exports = {
  uploadChatImage,
  uploadFromBase64,
  deleteChatImage,
  isAllowedAttachmentUrl,
  assertNoDataUrlStorage,
  sanitizeAttachments,
};
