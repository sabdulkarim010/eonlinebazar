/**
 * EonlineBazar — Admin Controller (barrel)
 * Extracted from: controllers/adminController.js
 * Routes that use this: routes/adminRoutes.js
 *
 * When adding new endpoints:
 * 1. Add handler here
 * 2. Export from barrel (original controller file)
 * 3. Add route in routes/[file].routes.js
 */

const customerAdminController = require('./admin/customerAdminController');
const adminProfileController = require('./admin/adminProfileController');
const adminSettingsController = require('./admin/adminSettingsController');
const { getDashboardAnalytics } = require('./analyticsController');

module.exports = {
    ...customerAdminController,
    ...adminProfileController,
    ...adminSettingsController,
    getDashboardAnalytics
};
