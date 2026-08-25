/**
 * EonlineBazar — Customer Auth Controller (barrel)
 * Extracted from: controllers/authController.js
 * Routes that use this: routes/authRoutes.js, routes/userRoutes.js
 *
 * When adding new endpoints:
 * 1. Add handler here
 * 2. Export from barrel (original controller file)
 * 3. Add route in routes/[file].routes.js
 */

const register = require('./auth/registerController');
const login = require('./auth/loginController');
const password = require('./auth/passwordController');
const oauth = require('./auth/oauthController');

module.exports = { ...register, ...login, ...password, ...oauth };
