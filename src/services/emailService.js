const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const sendOtpEmail = async (to, otp) => {
  await transporter.sendMail({
    from: `"SmartPick" <${process.env.EMAIL_USER}>`,
    to,
    subject: "SmartPick OTP Verification",
    html: `
      <div style="font-family:sans-serif">
        <h2>Your OTP Code</h2>
        <h1 style="letter-spacing:4px">${otp}</h1>
        <p>This OTP is valid for 10 minutes.</p>
      </div>
    `
  });
};

module.exports = { sendOtpEmail };
