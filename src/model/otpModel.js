import mongoose from "mongoose";

const otpSchema = new mongoose.Schema({
  email: { type: String, required: true, index: true },
  otp: { type: String, required: true },
  purpose: { type: String, enum: ["register", "reset_password", "changeEmail"], required: true },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 120 // Document expires after 120 seconds (2 minutes)
  }
});

export default mongoose.model("Otp", otpSchema);
