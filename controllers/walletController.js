const User = require("../models/User");
const WalletTransaction = require("../models/WalletTransaction");

exports.getMyWallet = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("name role walletBalance");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan",
      });
    }

    return res.json({
      success: true,
      wallet: {
        balance: user.walletBalance || 0,
        user: {
          _id: user._id,
          name: user.name,
          role: user.role,
        },
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.getMyWalletHistory = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

    const query = { user: req.user._id };
    const total = await WalletTransaction.countDocuments(query);
    const totalPages = Math.max(Math.ceil(total / pageSize), 1);

    const histories = await WalletTransaction.find(query)
      .populate("counterparty", "name role")
      .populate("actor", "name role")
      .populate("order", "_id totalPrice status")
      .sort({ createdAt: -1 })
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize);

    return res.json({
      success: true,
      total,
      page: pageNumber,
      limit: pageSize,
      totalPages,
      histories,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
