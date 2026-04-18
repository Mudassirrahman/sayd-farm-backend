const jwt = require("jsonwebtoken");
const User = require("../models/user");

// Optional authentication - doesn't fail if no token, but sets req.user if token is valid
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.headers["authorization"];

    if (!token || !token.startsWith("Bearer")) {
      // No token provided, continue without authentication (guest checkout)
      return next();
    }

    const actualToken = token.split(" ")[1];

    try {
      const decodedToken = jwt.verify(actualToken, process.env.JWT_SECRET_KEY);
      const user = await User.findById(decodedToken.id).select("-password");

      if (user) {
        req.user = user;
      }
    } catch (error) {
      // Invalid token, continue without authentication (guest checkout)
    }

    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
};

module.exports = optionalAuth;

