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
        // NEW: Extract the profile image URL
        const profileImage = profile.photos?.[0]?.value;

        if (!email) return done(null, false);

        let user = await User.findOne({ email });

        if (!user) {
          user = await User.create({
            fullName: name,
            email,
            googleId,
            profileImage, // NEW: Save image to DB on first login
            authProvider: "google",
            isVerified: true,
          });
        }

        if (!user.googleId) {
          user.googleId = googleId;
          user.isVerified = true;
          // NEW: Also update image if it was missing
          if (!user.profileImage) user.profileImage = profileImage;
          await user.save();
        }

        // THE FIX: Change 'name' to 'fullName' and add 'profileImage'
        // This object becomes 'req.user' or the session user
        return done(null, { 
          _id: user._id, 
          fullName: user.fullName, // Changed from name to fullName
          email: user.email,
          profileImage: user.profileImage // Added so it shows in drawer
        });
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