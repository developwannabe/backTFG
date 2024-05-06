require("dotenv").config();
const jwt = require("jsonwebtoken");

const crearToken = function (email, of) {
    const token = jwt.sign({ email: email, of: of }, process.env.JWTSECRET, {
        expiresIn: "1h",
    });
    return token;
};

const comprobarDatos = function (req, res, next) {
    if (req.body.email && req.body.password) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(req.body.email)) {
            res.send({ error: -1 });
            return;
        }
        next();
    } else {
        res.send({ error: -2 });
    }
};

module.exports = {
    crearToken,
    comprobarDatos,
};
