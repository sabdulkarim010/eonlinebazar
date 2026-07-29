const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/user');

function splitDisplayName(displayName) {
    const parts = String(displayName || 'User').trim().split(/\s+/).filter(Boolean);
    const firstName = parts[0] || 'User';
    const lastName = parts.length > 1 ? parts.slice(1).join(' ') : firstName;
    return { firstName, lastName };
}

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(
        new GoogleStrategy(
            {
                clientID: process.env.GOOGLE_CLIENT_ID,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                callbackURL: process.env.GOOGLE_CALLBACK_URL,
                scope: ['profile', 'email']
            },
            async (accessToken, refreshToken, profile, done) => {
                try {
                    const email = profile.emails?.[0]?.value?.toLowerCase();
                    const googleId = profile.id;
                    const avatarUrl = profile.photos?.[0]?.value || null;
                    const displayName = profile.displayName || profile.name?.givenName || 'User';

                    if (!email) {
                        return done(new Error('Google account did not provide an email address.'));
                    }

                    let user = await User.findOne({ googleId });

                    if (user) {
                        user.lastLogin = new Date();
                        if (avatarUrl && !user.avatarUrl) {
                            user.avatarUrl = avatarUrl;
                        }
                        if (avatarUrl && !user.avatar) {
                            user.avatar = avatarUrl;
                        }
                        await user.save();
                        return done(null, user);
                    }

                    user = await User.findOne({ email });

                    if (user) {
                        user.googleId = googleId;
                        user.lastLogin = new Date();
                        if (avatarUrl && !user.avatarUrl) {
                            user.avatarUrl = avatarUrl;
                        }
                        if (avatarUrl && !user.avatar) {
                            user.avatar = avatarUrl;
                        }
                        await user.save();
                        return done(null, user);
                    }

                    const { firstName, lastName } = splitDisplayName(displayName);

                    user = await User.create({
                        firstName,
                        lastName,
                        email,
                        googleId,
                        avatarUrl,
                        avatar: avatarUrl || '',
                        isVerified: true,
                        accountStatus: 'active',
                        mobile: null,
                        password: null
                    });

                    return done(null, user);
                } catch (err) {
                    return done(err);
                }
            }
        )
    );
}

passport.serializeUser((user, done) => done(null, user._id));

passport.deserializeUser((id, done) => {
    User.findById(id)
        .then((user) => done(null, user))
        .catch((err) => done(err));
});

module.exports = passport;
