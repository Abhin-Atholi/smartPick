const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../model/userModel");

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

        if (!email) return done(null, false); // rare case

        // 1) find by email
        let user = await User.findOne({ email });

        // 2) if not exists, create
        if (!user) {
            user = await User.create({
                fullName: name,
                email,
                googleId,
                authProvider: "google",
                isVerified: true
            });
        }

        // 3) if exists but googleId missing, link it
        if (!user.googleId) {
          user.googleId = googleId;
          user.isVerified = true;
          await user.save();
        }

        // pass minimal user object to req.user
        return done(null, { _id: user._id, name: user.fullName, email: user.email });
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

module.exports = passport;
