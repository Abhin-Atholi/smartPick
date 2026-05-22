//const nodemailer = require("nodemailer");
import nodemailer from "nodemailer"

export const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

export const sendOtpEmail = async (to, otp) => {
  try {
    const info = await transporter.sendMail({
      from: `"SmartPick" <${process.env.EMAIL_USER}>`,
      to,
      subject: "SmartPick OTP Verification",
      html: `<div style="font-family:sans-serif">

        <h2>Your OTP Code</h2>

        <h1 style="letter-spacing:4px">${otp}</h1>

        <p>This OTP is valid for 3 minutes.</p>

      </div>`
    });
    return { ok: true, info };
  } catch (error) {
    console.error("Email sending failed:", error);
    return { ok: false, error };
  }
};

