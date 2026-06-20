const router = require("express").Router();
const {
  createRestaurant,
  getMyRestaurants,
  getRestaurantById,
  getAllRestaurants,
  updateRestaurant,
  updateRestaurantStatus,
  updateRestaurantSchedule,
  updateRestaurantLocation,
  deleteRestaurant,
  addCategories,
  removeCategory,
} = require("../controllers/restaurantController");
const { protect } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");

// Public routes
router.get("/", getAllRestaurants);

// Protected routes - Owner
router.post("/", protect, authorize("owner"), createRestaurant);
router.get("/owner/my-restaurants", protect, authorize("owner"), getMyRestaurants);
router.put("/:restaurantId", protect, authorize("owner"), updateRestaurant);
router.put("/:restaurantId/status", protect, authorize("owner"), updateRestaurantStatus);
router.put("/:restaurantId/schedule", protect, authorize("owner"), updateRestaurantSchedule);
router.delete("/:restaurantId", protect, authorize("owner"), deleteRestaurant);

// Public detail route
router.get("/:restaurantId", getRestaurantById);

// Location routes
router.put("/:restaurantId/location", protect, authorize("owner"), updateRestaurantLocation);

// Categories routes
router.post("/:restaurantId/categories", protect, authorize("owner"), addCategories);
router.delete("/:restaurantId/categories/:category", protect, authorize("owner"), removeCategory);

module.exports = router;
