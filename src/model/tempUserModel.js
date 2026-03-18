import mongoose from "mongoose";

const tempUserSchema = new mongoose.Schema({
    email: { type: String, required: true },
    fullName: { type: String, required: true },
    password: { type: String, required: true },
    otp: { type: String, required: true },
    // 🔥 ADD THIS LINE - This was missing in your schema
    otpExpires: { type: Date, required: true }, 
    createdAt: {
        type: Date,
        default: Date.now,
        // Document lives for 10 minutes (600s). The actual OTP inside it expires in 2 mins. 
        expires: 600 
    }
});

export default mongoose.model("tempUser", tempUserSchema);