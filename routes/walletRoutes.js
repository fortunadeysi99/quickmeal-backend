const router = require("express").Router();
const { protect } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");
const {
  getMyWallet,
  getMyWalletHistory,
  getWalletByUserIdAsAdmin,
  getWalletHistoryByUserIdAsAdmin,
  adjustWalletAsAdmin,
} = require("../controllers/walletController");

router.get("/me", protect, authorize("user", "owner", "admin"), getMyWallet);
router.get("/history", protect, authorize("user", "owner", "admin"), getMyWalletHistory);
router.get("/admin/users/:userId", protect, authorize("admin"), getWalletByUserIdAsAdmin);
router.get("/admin/users/:userId/history", protect, authorize("admin"), getWalletHistoryByUserIdAsAdmin);
router.post("/admin/users/:userId/adjust", protect, authorize("admin"), adjustWalletAsAdmin);

module.exports = router;
