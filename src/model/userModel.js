const mongoose=require("mongoose")

const userSchema= new mongoose.Schema({
    email:{
        type:String,
        required:true,
        unique:true
    },
    fullName:{
        type:String,
        required:true
    },
    role:{
        type:String,
        enum:["admin","user"],
        default:"user",
        index:true
    },
    phone:{
        type:String
    },
    status:{
        type:String,
        enum:["active","blocked"],
        default:"active",
        index:true
    },
    // password:{
    //     type:String,
    //     required:true
    // },
    isVerified: { type: Boolean, default: false },
    otp: { type: String, default: null },
    otpExpires: { type: Date, default: null },
    otpLastSentAt: { type: Date, default: null },
    googleId: { type: String, default: null },
    authProvider: {
        type: String,
        enum: ["local", "google"],
        default: "local"
    },

    googleId: {
        type: String,
        default: null
    },

    password: {
        type: String,
        required: function () {
            return this.authProvider === "local";
        }
    },
    otpPurpose: { type: String, enum: ["verify", "reset_password"], default: null },




},{ timestamps: true })

module.exports=mongoose.model("user",userSchema)