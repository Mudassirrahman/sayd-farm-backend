const nodemailer = require("nodemailer");

// Create transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: process.env.SMTP_PORT || 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

// Email verification template
const getVerificationEmailTemplate = (name, verificationLink) => {
  return {
    subject: "Verify Your Email Address",
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .button { display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { margin-top: 30px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>Email Verification</h2>
          <p>Hello ${name},</p>
          <p>Thank you for registering with us! Please verify your email address by clicking the button below:</p>
          <a href="${verificationLink}" class="button">Verify Email</a>
          <p>Or copy and paste this link into your browser:</p>
          <p>${verificationLink}</p>
          <p>This link will expire in 24 hours.</p>
          <div class="footer">
            <p>If you didn't create an account, please ignore this email.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };
};

// Password reset template
const getPasswordResetEmailTemplate = (name, resetLink) => {
  return {
    subject: "Reset Your Password",
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .button { display: inline-block; padding: 12px 24px; background-color: #dc3545; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { margin-top: 30px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>Password Reset Request</h2>
          <p>Hello ${name},</p>
          <p>You requested to reset your password. Click the button below to set a new password:</p>
          <a href="${resetLink}" class="button">Reset Password</a>
          <p>Or copy and paste this link into your browser:</p>
          <p>${resetLink}</p>
          <p>This link will expire in 1 hour.</p>
          <p>If you didn't request a password reset, please ignore this email.</p>
          <div class="footer">
            <p>For security reasons, please do not share this link with anyone.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };
};

// Order confirmation template
const getOrderConfirmationEmailTemplate = (
  name,
  orderId,
  totalAmount,
  items
) => {
  const itemsList = items
    .map(
      (item) => `
      <tr>
        <td>${item.name}</td>
        <td>${item.quantity}</td>
        <td>$${item.price.toFixed(2)}</td>
        <td>$${(item.quantity * item.price).toFixed(2)}</td>
      </tr>
    `
    )
    .join("");

  return {
    subject: `Order Confirmation - Order #${orderId}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
          th { background-color: #f2f2f2; }
          .total { font-size: 18px; font-weight: bold; margin-top: 20px; }
          .footer { margin-top: 30px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>Order Confirmation</h2>
          <p>Hello ${name},</p>
          <p>Thank you for your order! Your order has been received and is being processed.</p>
          <h3>Order Details</h3>
          <p><strong>Order ID:</strong> ${orderId}</p>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Quantity</th>
                <th>Price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsList}
            </tbody>
          </table>
          <div class="total">Total Amount: $${totalAmount.toFixed(2)}</div>
          <p>We'll send you another email when your order ships.</p>
          <div class="footer">
            <p>If you have any questions, please contact our support team.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };
};

// Send email function
const sendEmail = async (to, subject, html) => {
  try {
    // If SMTP is not configured, log the email instead
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.log("=== EMAIL (SMTP not configured) ===");
      console.log("To:", to);
      console.log("Subject:", subject);
      console.log("HTML:", html);
      console.log("================================");
      return { success: true, message: "Email logged (SMTP not configured)" };
    }

    const transporter = createTransporter();
    const info = await transporter.sendMail({
      from: `"${process.env.SMTP_FROM_NAME || "Store"}" <${
        process.env.SMTP_USER
      }>`,
      to,
      subject,
      html,
    });

    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Email sending error:", error);
    return { success: false, error: error.message };
  }
};

// Send verification email
const sendVerificationEmail = async (email, name, verificationToken) => {
  const verificationLink = `${
    process.env.FRONTEND_URL || "http://localhost:5173"
  }/verify-email?token=${verificationToken}`;
  const { subject, html } = getVerificationEmailTemplate(
    name,
    verificationLink
  );
  return await sendEmail(email, subject, html);
};

// Send password reset email
const sendPasswordResetEmail = async (email, name, resetToken) => {
  const resetLink = `${
    process.env.FRONTEND_URL || "http://localhost:5173"
  }/reset-password?token=${resetToken}`;
  const { subject, html } = getPasswordResetEmailTemplate(name, resetLink);
  return await sendEmail(email, subject, html);
};

// Send order confirmation email
const sendOrderConfirmationEmail = async (
  email,
  name,
  orderId,
  totalAmount,
  items
) => {
  const { subject, html } = getOrderConfirmationEmailTemplate(
    name,
    orderId,
    totalAmount,
    items
  );
  return await sendEmail(email, subject, html);
};

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendOrderConfirmationEmail,
  sendEmail,
};
