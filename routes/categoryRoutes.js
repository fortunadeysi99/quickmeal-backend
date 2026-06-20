const router = require("express").Router();
const {
  createCategory,
  getCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
} = require("../controllers/categoryController");
const { protect } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");

// Public routes
router.get("/restaurant/:restaurantId", getCategories);
router.get("/:categoryId", getCategoryById);

// Protected routes - Owner
router.post("/restaurant/:restaurantId", protect, authorize("owner"), createCategory);
router.put("/:categoryId", protect, authorize("owner"), updateCategory);
router.delete("/:categoryId", protect, authorize("owner"), deleteCategory);

module.exports = router;
