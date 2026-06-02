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

// Protected routes - Owner
router.post("/restaurant/:restaurantId", protect, authorize("owner"), createMenu);
router.put("/:menuId", protect, authorize("owner"), updateMenu);
router.delete("/:menuId", protect, authorize("owner"), deleteMenu);

module.exports = router;
