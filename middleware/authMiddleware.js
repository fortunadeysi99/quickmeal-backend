const jwt = require("jsonwebtoken");
const User = require("../models/User");

exports.protect = async (
  req,
  res,
  next
) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith(
      "Bearer"
    )
  ) {
    token =
      req.headers.authorization.split(
        " "
      )[1];

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    req.user = await User.findOne({
      _id: decoded.id,
      status: "active",
    });

    if (!req.user) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    next();
  } else {
    res.status(401).json({
      message: "Unauthorized",
    });
  }
};