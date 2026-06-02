const router = require("express").Router();
const {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
} = require("../controllers/cartController");
const { protect } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");

// Protected routes - User
router.get("/", protect, authorize("user"), getCart);
router.post("/add", protect, authorize("user"), addToCart);
router.put("/update", protect, authorize("user"), updateCartItem);
router.delete("/:menuId", protect, authorize("user"), removeFromCart);
router.delete("/", protect, authorize("user"), clearCart);

module.exports = router;
