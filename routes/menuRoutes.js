const router = require("express").Router();
const {
  createMenu,
  getRestaurantMenus,
  getMenuById,
  updateMenu,
  deleteMenu,
  searchMenuByName,
} = require("../controllers/menuController");
const { protect } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");

// Public routes
router.get("/search", searchMenuByName);
router.get("/restaurant/:restaurantId", getRestaurantMenus);
router.get("/:menuId", getMenuById);

// Protected routes - Owner and Admin
router.post("/restaurant/:restaurantId", protect, authorize("owner", "admin"), createMenu);
router.put("/:menuId", protect, authorize("owner", "admin"), updateMenu);
router.delete("/:menuId", protect, authorize("owner", "admin"), deleteMenu);

module.exports = router;
