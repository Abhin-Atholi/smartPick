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
    const email = profile.emails?.[0]?.value?.toLowerCase();
    const googleId = profile.id;
    const name = profile.displayName;
    const profileImage = profile.photos?.[0]?.value.replace('=s96-c', '=s400-c'); 

    if (!email) return done(null, false);

    let user = await User.findOne({ email });

    if (!user) {
      // Create new user
      user = await User.create({
        fullName: name,
        email,
        googleId,
        profileImage,
        authProvider: "google",
        isVerified: true,
      });
    } else {
      // UPDATE: Always ensure these are up to date for existing users
      let isChanged = false;
      
      if (!user.googleId) { user.googleId = googleId; isChanged = true; }
      if (!user.isVerified) { user.isVerified = true; isChanged = true; }
      
      // Force update the image if Google provides a new one
      if (profileImage && user.profileImage !== profileImage) {
        user.profileImage = profileImage;
        isChanged = true;
      }

      if (isChanged) await user.save();
    }

    // Pass the ENTIRE user object found/updated in the DB
    // This ensures consistency between Strategy and Deserializer
    return done(null, user); 
  } catch (err) {
    return done(err, null);
  }
}
  )
);


passport.serializeUser((user, done) => {
  // Ensure we only store the ID string in the session
  done(null, user._id || user.id); 
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    // If user is found, req.user is populated. If not, req.user is null.
    done(null, user); 
  } catch (err) {
    done(err, null);
  }
});



export default passport;