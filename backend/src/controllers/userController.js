/********************************************************************
 * Project: EonlineBazar
 * File: userController.js
 * Location: backend/src/controllers/userController.js
 * Description: Compatibility aggregator — re-exports split user controllers.
 ********************************************************************/

const authController = require('./authController');
const userProfileController = require('./userProfileController');
const userWishlistController = require('./userWishlistController');

module.exports = {
    testUserRoute: authController.testUserRoute,
    registerUser: authController.registerUser,
    loginUser: authController.loginUser,
    forgotPassword: authController.forgotPassword,
    resetPassword: authController.resetPassword,
    verifyEmail: authController.verifyEmail,
    resendVerification: authController.resendVerification,
    getUserProfile: userProfileController.getUserProfile,
    updateUserProfile: userProfileController.updateUserProfile,
    updateUserAvatar: userProfileController.updateUserAvatar,
    changePassword: userProfileController.changePassword,
    requestContactUpdateOtp: userProfileController.requestContactUpdateOtp,
    verifyContactUpdateOtp: userProfileController.verifyContactUpdateOtp,
    getWishlist: userWishlistController.getWishlist,
    addToWishlist: userWishlistController.addToWishlist,
    removeFromWishlist: userWishlistController.removeFromWishlist,
    getAddresses: userProfileController.getAddresses,
    addAddress: userProfileController.addAddress,
    updateAddress: userProfileController.updateAddress,
    deleteAddress: userProfileController.deleteAddress,
    convertPoints: userProfileController.convertPoints
};
