import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import User from "../model/userModel.js"; // Extension required

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        const googleId = profile.id;
        const name = profile.displayName;

        if (!email) return done(null, false);

        // 1) Find user by email
        let user = await User.findOne({ email });

        // 2) If user doesn't exist, create a new one
        if (!user) {
          user = await User.create({
            fullName: name,
            email,
            googleId,
            authProvider: "google",
            isVerified: true,
          });
        }

        // 3) If user exists but googleId is missing (e.g., they registered via email first)
        if (!user.googleId) {
          user.googleId = googleId;
          user.isVerified = true;
          await user.save();
        }

        // Pass minimal user object to req.user (Passport handles the session)
        return done(null, { _id: user._id, name: user.fullName, email: user.email });
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

// Optional: Serialize/Deserialize if using passport.session() in app.js
passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});



export default passport;