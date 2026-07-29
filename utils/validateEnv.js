/**
 * Boot-time environment validation.
 * Call immediately after dotenv.config() in server.js.
 */

const INSECURE_JWT_SECRET = 'eOnlineBazarSecretKey123';

const REQUIRED_VARS = [
    'MONGODB_URI',
    'JWT_SECRET',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
    'SMTP_HOST',
    'SMTP_USER',
    'SMTP_PASS',
    'PORT',
];

function validateEnv() {
    const missing = REQUIRED_VARS.filter((key) => {
        const value = process.env[key];
        return value === undefined || value === null || String(value).trim() === '';
    });

    if (missing.length > 0) {
        console.error('Environment validation failed. Missing or empty required variables:');
        missing.forEach((key) => console.error(`  - ${key}`));
        console.error('\nCopy .env.example to .env and fill in all required values.');
        process.exit(1);
    }

    if (process.env.JWT_SECRET === INSECURE_JWT_SECRET) {
        console.error('INSECURE: Please change JWT_SECRET in your .env file');
        process.exit(1);
    }
}

module.exports = validateEnv;
