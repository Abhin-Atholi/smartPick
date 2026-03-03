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
        // 🔥 INCREASE TO 300 (5 mins) to prevent background deletion before timer ends
        expires: 300 
    }
});

export default mongoose.model("tempUser", tempUserSchema);