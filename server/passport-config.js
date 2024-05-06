require("dotenv").config();
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const ExtractJwt = require("passport-jwt").ExtractJwt;
const JwtStrategy = require("passport-jwt").Strategy;

const { sistema } = require('../index.js');

passport.serializeUser(function (user, done) {
    done(null, user.nick);
});

passport.deserializeUser(function (nick, done) {
    done(null, { nick: nick });
});

passport.use(
    new LocalStrategy(
        { usernameField: "usuario", passwordField: "password" },
        function (username, password, done) {
            sistema.iniciarSesion(
                { email: username, password: password },
                function (user) {
                    if (user){
                        return done(null, user);
                    }else{
                        return done(null, false);
                    }
                }
            );
        }
    )
);