const router = require("express").Router();
const {
  registerUser,
  registerOwner,
  login,
  getCurrentUser,
} = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

// Public routes
router.post("/register-user", registerUser);
router.post("/register-owner", registerOwner);
router.post("/login", login);

// Protected routes
router.get("/me", protect, getCurrentUser);

module.exports = router;

