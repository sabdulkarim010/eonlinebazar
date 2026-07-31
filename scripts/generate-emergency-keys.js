const crypto = require('crypto');

console.log('\n=== EMERGENCY PANEL KEYS ===\n');
console.log('EMERGENCY_URL_TOKEN=' + crypto.randomBytes(24).toString('hex'));
console.log('EMERGENCY_MASTER_KEY=' + crypto.randomBytes(32).toString('hex'));
console.log('\nYour secret URL will be:');
console.log('http://localhost:5000/sys/[EMERGENCY_URL_TOKEN]/control');
console.log('\n⚠️  Save these in your .env file and NEVER share them!\n');
