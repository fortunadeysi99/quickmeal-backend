const router = require("express").Router();
const {
  createOrder,
  getMyOrders,
  getOrderById,
  getRestaurantOrders,
  updateOrderStatus,
  updatePaymentStatus,
  cancelOrder,
} = require("../controllers/orderController");
const { protect } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");

// Protected routes - User
router.post("/", protect, authorize("user"), createOrder);
router.get("/my-orders", protect, authorize("user"), getMyOrders);
router.get("/:orderId", protect, getOrderById);
router.put("/:orderId/payment-status", protect, authorize("user"), updatePaymentStatus);
router.put("/:orderId/cancel", protect, authorize("user"), cancelOrder);

// Protected routes - Owner
router.get("/restaurant/:restaurantId", protect, authorize("owner", "admin"), getRestaurantOrders);
router.put("/:orderId/status", protect, authorize("owner", "admin"), updateOrderStatus);

module.exports = router;
