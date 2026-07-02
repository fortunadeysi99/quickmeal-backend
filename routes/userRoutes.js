const router = require("express").Router();
const {
  getMyProfile,
  updateProfile,
  changePassword,
  registerMobileDevice,
  unregisterMobileDevice,
  sendTestNotificationToCurrentUser,
  getFirebaseEnvStatus,
  addToWishlist,
  removeFromWishlist,
  getWishlist,
  getAllUsers,
  getUserDetail,
  createUserByAdmin,
  updateUserByAdmin,
  deleteUser,
} = require("../controllers/userController");
const { protect } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");

// Protected routes - User
router.get("/profile", protect, getMyProfile);
router.put("/profile", protect, updateProfile);
router.put("/change-password", protect, changePassword);
router.post("/devices/register", protect, registerMobileDevice);
router.post("/devices/unregister", protect, unregisterMobileDevice);
router.post("/notifications/test", protect, sendTestNotificationToCurrentUser);

// Wishlist routes
router.post("/wishlist", protect, addToWishlist);
router.delete("/wishlist/:menuId", protect, removeFromWishlist);
router.get("/wishlist", protect, getWishlist);

// Admin routes
router.get("/firebase/env", protect, authorize("admin"), getFirebaseEnvStatus);
router.get("/", protect, authorize("admin"), getAllUsers);
router.post("/", protect, authorize("admin"), createUserByAdmin);
router.get("/:userId", protect, authorize("admin"), getUserDetail);
router.put("/:userId", protect, authorize("admin"), updateUserByAdmin);
router.delete("/:userId", protect, authorize("admin"), deleteUser);

module.exports = router;

