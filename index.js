const express = require("express");
const axios = require("axios");
const env = require("dotenv");
const fs = require("fs");
const xml2js = require("xml2js");
const xmlBeautifier = require("xml-beautifier");
const passport = require("passport");
const Sistem = require("./server/sistem.js");
const bodyParser = require("body-parser");
const cookieSession = require("cookie-session");
const jwt = require("jsonwebtoken");

const sistema = new Sistem();
module.exports.sistema = sistema;

require("./server/passport-config.js");
const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(
    cookieSession({
        name: "Serv",
        keys: ["key1", "key2"],
    })
);

const crearToken = function (email, of) {
    const token = jwt.sign({ email: email, of: of }, process.env.JWTSECRET, {
        expiresIn: "1h",
    });
    return token;
};

env.config();

const PORT = process.env.PORT || 3000;

const simulatorHost = process.env.SIMULATOR_HOST;

function generateSessionId() {
    const id = "CPN_IDE_SESSION_" + new Date().getTime();
    return id;
}

app.use(express.static(__dirname + "/"));

app.get("/", function (request, response) {
    console.log(request.session);
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/plain");
    response.end("Hola Mundo!");
});

//Autenticación
app.use(passport.initialize());
app.use(passport.session());

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

app.post(
    "/iniciarSesion",
    comprobarDatos,
    function (req, res, next) {
        passport.authenticate("local", function (err, user, info) {
            if (err) {
                return next(err);
            }
            if (!user) {
                return res.send({ error: "Authentication failed" });
            }
            req.logIn(user, function (err) {
                if (err) {
                    return next(err);
                }
                return next();
            });
        })(req, res, next);
    },
    function (req, res) {
        let nick = req.user.nick;
        let tkn = null;
        let error = null;
        if (nick != -1 && nick != -2) {
            tkn = crearToken(nick, "acc");
        } else {
            error = nick;
        }
        res.send({ error: error, tkn: tkn, nick: nick });
    }
);

app.post("/registrarUsuario", comprobarDatos, function (req, res) {
    sistema.registrarUsuario(
        { email: req.body.email, password: req.body.password },
        function (nick, error) {
            res.send({ email: nick, error: error });
        }
    );
});

//Simulación
app.get("/init", (request, response) => {
    const filePath = "./nets/cadiz.cpn";
    fs.readFile(filePath, (err, data) => {
        if (err) {
            console.error("Error al leer el archivo:", err);
            return;
        }
        xml2js.parseString(data, (err, result) => {
            if (err) {
                console.error("Error al parsear el XML:", err);
                return;
            }
            const builder = new xml2js.Builder({
                headless: true,
                renderOpts: { pretty: true, indent: " ", newline: "\n" },
            });
            let cpnXml = builder.buildObject(result);
            cpnXml = xmlBeautifier(cpnXml);
            let body = {
                complex_verify: true,
                need_sim_restart: true,
                xml: cpnXml,
            };
            let config = {
                headers: { "X-SessionId": generateSessionId() },
            };
            axios
                .post(simulatorHost + "/api/v2/cpn/init", body, config)
                .then((res) => {
                    console.log(res.data);
                    body = {
                        options: {
                            fair_be: "false",
                            global_fairness: "false",
                        },
                    };
                    axios
                        .post(
                            simulatorHost + "/api/v2/cpn/sim/init",
                            body,
                            config
                        )
                        .then((res) => {
                            console.log(res.data);
                            body = {
                                addStep: 5000,
                                untilStep: 0,
                                untilTime: 0,
                                addTime: 0,
                                amount: 5000,
                            };
                            axios
                                .post(
                                    simulatorHost +
                                        "/api/v2/cpn/sim/step_fast_forward",
                                    body,
                                    config
                                )
                                .then((res) => {
                                    console.log(res.data);
                                    response.send(
                                        res.data["tokensAndMark"].find(
                                            (x) => x.id === "ID1497673622"
                                        )
                                    );
                                });
                        });
                });
        });
    });
});
//Inicio app
app.listen(PORT, () => {
    console.log(`App está escuchando en el puerto ${PORT}`);
    console.log("Ctrl+C para salir");
});
