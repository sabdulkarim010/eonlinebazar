const { v2: cloudinary } = require('cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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
 * Parse a base64 data URI and upload.
 * @param {string} base64String - e.g. data:image/png;base64,....
 * @param {string} roomId
 */
async function uploadFromBase64(base64String, roomId) {
  if (!base64String || typeof base64String !== 'string') {
    throw new Error('base64 string is required');
  }

  let mimeType = 'image/jpeg';
  let base64Data = base64String;

  const match = base64String.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    mimeType = match[1];
    base64Data = match[2];
  } else if (base64String.includes(',')) {
    const parts = base64String.split(',');
    base64Data = parts[parts.length - 1];
  }

  const fileBuffer = Buffer.from(base64Data, 'base64');
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

module.exports = {
  uploadChatImage,
  uploadFromBase64,
  deleteChatImage,
};
