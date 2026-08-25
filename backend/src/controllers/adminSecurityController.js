/**
 * EonlineBazar — Admin Security Controller (barrel)
 * Extracted from: controllers/adminSecurityController.js
 * Routes that use this: routes/adminRoutes.js
 *
 * When adding new endpoints:
 * 1. Add handler here
 * 2. Export from barrel (original controller file)
 * 3. Add route in routes/[file].routes.js
 */

const auth = require('./admin/authController');
const session = require('./admin/sessionController');
const blacklist = require('./admin/blacklistController');
const history = require('./admin/loginHistoryController');

module.exports = { ...auth, ...session, ...blacklist, ...history };
