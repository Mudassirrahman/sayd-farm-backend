const User = require("../models/user");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const {
  sendVerificationEmail,
  sendPasswordResetEmail,
} = require("../services/emailService");

// REGISTER
const register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const isUserExist = await User.findOne({ email });
    if (isUserExist) {
      return res.status(400).json({ message: "User already registered" });
    }

    const rawVerificationToken = crypto.randomBytes(32).toString("hex");
    const hashedVerificationToken = crypto
      .createHash("sha256")
      .update(rawVerificationToken)
      .digest("hex");

    const verificationTokenExpiry = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

    const userRole = role || "user";

    const newUser = new User({
      name,
      email,
      password,
      role: userRole,
      emailVerificationToken: hashedVerificationToken,
      emailVerificationTokenExpiry: verificationTokenExpiry,
      isEmailVerified: false,
    });

    await newUser.save();

    // Send verification email with raw token
    await sendVerificationEmail(email, name, rawVerificationToken);

    res.status(201).json({
      message:
        "User registered successfully. Please check your email to verify your account.",
      userId: newUser._id,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Registration failed", error: error.message });
  }
};

// VERIFY EMAIL
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res
        .status(400)
        .json({ message: "Verification token is required" });
    }

    // Hash the incoming raw token to match with DB
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      emailVerificationToken: hashedToken, // Search with hashed token
      emailVerificationTokenExpiry: { $gt: Date.now() },
    });

    if (!user) {
      return res
        .status(400)
        .json({ message: "Invalid or expired verification token" });
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationTokenExpiry = undefined;
    await user.save();

    res.status(200).json({ message: "Email verified successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Email verification failed", error: error.message });
  }
};

// RESEND VERIFICATION EMAIL
const resendVerificationEmail = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({ message: "Email is already verified" });
    }

    // Generate new raw verification token
    const rawVerificationToken = crypto.randomBytes(32).toString("hex");
    // Hash the token for Database
    const hashedVerificationToken = crypto
      .createHash("sha256")
      .update(rawVerificationToken)
      .digest("hex");

    const verificationTokenExpiry = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

    user.emailVerificationToken = hashedVerificationToken; // Store hashed token
    user.emailVerificationTokenExpiry = verificationTokenExpiry;
    await user.save();

    // Send verification email with raw token
    await sendVerificationEmail(email, user.name, rawVerificationToken);

    res.status(200).json({ message: "Verification email sent successfully" });
  } catch (error) {
    res
      .status(500)
      .json({
        message: "Failed to resend verification email",
        error: error.message,
      });
  }
};

// LOGIN
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "All fields required" });
    }

    const isExist = await User.findOne({ email });
    if (!isExist) {
      return res.status(401).json({ message: "Email or password not match" });
    }

    // Check if email is verified
    if (!isExist.isEmailVerified) {
      return res.status(401).json({
        message: "Please verify your email before logging in",
        requiresVerification: true,
      });
    }

    const comparePassword = await bcrypt.compare(password, isExist.password);
    if (!comparePassword) {
      return res.status(401).json({ message: "Email or password not match" });
    }

    const token = jwt.sign({ id: isExist._id }, process.env.JWT_SECRET_KEY, {
      expiresIn: "30d",
    });

    return res.status(200).json({
      message: "User logged in successfully",
      userName: isExist.name,
      role: isExist.role,
      token: token,
    });
  } catch (error) {
    res.status(500).json({ message: "Login failed", error: error.message });
  }
};

// FORGOT PASSWORD
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email });

    if (!user) {
      // Don't reveal if user exists for security
      return res.status(200).json({
        message: "If the email exists, a password reset link has been sent",
      });
    }

    // Generate raw reset token
    const rawResetToken = crypto.randomBytes(32).toString("hex");
    // Hash the token for Database
    const hashedResetToken = crypto
      .createHash("sha256")
      .update(rawResetToken)
      .digest("hex");

    const resetTokenExpiry = Date.now() + 60 * 60 * 1000; // 1 hour

    user.resetPasswordToken = hashedResetToken; // Store hashed token
    user.resetPasswordTokenExpiry = resetTokenExpiry;
    await user.save();

    // Send password reset email with raw token
    await sendPasswordResetEmail(email, user.name, rawResetToken);

    res.status(200).json({
      message: "If the email exists, a password reset link has been sent",
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to process request", error: error.message });
  }
};

// RESET PASSWORD
const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res
        .status(400)
        .json({ message: "Token and password are required" });
    }

    // Hash the incoming raw token to match with DB
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      resetPasswordToken: hashedToken, // Search with hashed token
      resetPasswordTokenExpiry: { $gt: Date.now() },
    });

    if (!user) {
      return res
        .status(400)
        .json({ message: "Invalid or expired reset token" });
    }

    // Update password
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordTokenExpiry = undefined;
    await user.save();

    res.status(200).json({ message: "Password reset successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Password reset failed", error: error.message });
  }
};

// LOGOUT
const logout = (req, res) => {
  res.json({ message: "Logged out successfully" });
};

module.exports = {
  register,
  login,
  logout,
  verifyEmail,
  resendVerificationEmail,
  forgotPassword,
  resetPassword,
};

