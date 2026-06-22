const router = require("express").Router();
const { protect } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");
const {
  getMyWallet,
  getMyWalletHistory,
} = require("../controllers/walletController");

router.get("/me", protect, authorize("user", "owner", "admin"), getMyWallet);
router.get("/history", protect, authorize("user", "owner", "admin"), getMyWalletHistory);

module.exports = router;
