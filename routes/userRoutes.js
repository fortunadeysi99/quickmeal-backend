const router = require("express").Router();
const {
  getMyProfile,
  updateProfile,
  changePassword,
  addToWishlist,
  removeFromWishlist,
  getWishlist,
  getAllUsers,
  deleteUser,
} = require("../controllers/userController");
const { protect } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");

// Protected routes - User
router.get("/profile", protect, getMyProfile);
router.put("/profile", protect, updateProfile);
router.put("/change-password", protect, changePassword);

// Wishlist routes
router.post("/wishlist", protect, addToWishlist);
router.delete("/wishlist/:menuId", protect, removeFromWishlist);
router.get("/wishlist", protect, getWishlist);

// Admin routes
router.get("/", protect, authorize("admin"), getAllUsers);
router.delete("/:userId", protect, authorize("admin"), deleteUser);

module.exports = router;

