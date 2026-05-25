const REQUIRED_ENV = [
    "MONGODB_URI",
    "SESSION_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_CALLBACK_URL",
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
    "RAZORPAY_KEY_ID",
    "RAZORPAY_KEY_SECRET",
    "EMAIL_USER",
    "EMAIL_PASS"
];

let hasMissingVars = false;

REQUIRED_ENV.forEach(key => {
    if (!process.env[key]) {
        console.error(`🚨 CRITICAL: Missing required environment variable: ${key}`);
        hasMissingVars = true;
    }
});

if (hasMissingVars) {
    console.error("🚨 Server cannot start due to missing environment variables. Exiting...");
    process.exit(1);
}
