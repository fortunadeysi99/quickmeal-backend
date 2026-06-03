const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const { protect } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");

// Semua route ini hanya untuk admin
router.use(protect, authorize("admin"));

router.get("/overview", adminController.getOverview);
router.get("/users", adminController.getAllUsers);
router.get("/owners", adminController.getAllOwners);
router.get("/restaurants", adminController.getAllRestaurants);
router.get("/menus", adminController.getAllMenus);
router.get("/orders", adminController.getOrders);
router.get("/users/:userId/orders", adminController.getOrdersByUser);

// Admin update category
router.put("/categories/:categoryId", adminController.updateCategoryAsAdmin);

module.exports = router;
