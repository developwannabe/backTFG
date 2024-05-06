require("dotenv").config();
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const ExtractJwt = require("passport-jwt").ExtractJwt;
const JwtStrategy = require("passport-jwt").Strategy;

const { sistema } = require("../index.js");

passport.serializeUser(function (user, done) {
    done(null, user.email);
});

passport.deserializeUser(function (email, done) {
    done(null, { "email": email });
});

passport.use(
    new LocalStrategy(
        { usernameField: "email", passwordField: "password" },
        function (username, password, done) {
            sistema.iniciarSesion(
                { email: username, password: password },
                function (user) {
                    if (user) {
                        if (user.error == null) {
                            return done(null, user);
                        }
                    }
                    return done(user.error, false);
                }
            );
        }
    )
);
