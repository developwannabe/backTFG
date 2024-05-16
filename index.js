const express = require("express");
const axios = require("axios");
const env = require("dotenv");
env.config();
const fs = require("fs");
const cors = require("cors");
const xml2js = require("xml2js");
const xmlBeautifier = require("xml-beautifier");
const passport = require("passport");
const Sistem = require("./server/sistem.js");
const bodyParser = require("body-parser");
const cookieSession = require("cookie-session");
const utils = require("./server/utils.js");

const sistema = new Sistem();
module.exports.sistema = sistema;

require("./server/passport-config.js");
const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(
    cors({
        origin: "http://localhost:3001",
    })
);

app.use(
    cookieSession({
        name: "Serv",
        keys: ["key1", "key2"],
    })
);

const PORT = process.env.PORT || 3000;

const simulatorHost = process.env.SIMULATOR_HOST;

function generateSessionId() {
    const id = "CPN_IDE_SESSION_" + new Date().getTime();
    return id;
}

app.use(express.static(__dirname + "/"));

//Autenticación
app.use(passport.initialize());
app.use(passport.session());

app.get("/ping", function (req, res) {
    res.send("pong");
});

app.post(
    "/iniciarSesion",
    utils.comprobarDatos,
    function (req, res, next) {
        passport.authenticate("local", function (err, user, info) {
            if (err) {
                return res.send({ error: err });
            }
            if (!user) {
                return res.send({ error: err });
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
        let email = req.user.email;
        let tkn = utils.crearToken(email, "acc");
        res.send({ tkn: tkn, email: email });
    }
);

app.post("/registrarUsuario", utils.comprobarDatos, function (req, res) {
    sistema.registrarUsuario(
        { email: req.body.email, password: req.body.password },
        function (nick, error) {
            res.send({ email: nick, error: error });
        }
    );
});

//Simulación
app.post("/simular", (request, response) => {
    const filePath = "./nets/cadiz.cpn";
    const tupla = "(A,B,C,D)";
    if(request.body == null){
        response.send({error: "No se han enviado datos"});
        return;
    }
    if(request.body.origen != 11 && request.body.origen != 12){
        response.send({error: "No se ha enviado la petición correcta"});
        return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            console.error("Error al leer el archivo:", err);
            return;
        }
        xml2js.parseString(data, (err, result) => {
            let newJson = result;
            if (err) {
                console.error("Error al parsear el XML:", err);
                return;
            }
            let tup;
            sistema.ultimaEvaluacion(function(err, eval){
                if(err){
                    console.error("Error al buscar la última evaluación:", err);
                    return;
                }
                for (let i = 0; i < eval.evaluacion.length; i++) {
                    transicion = eval.evaluacion[i];
                    tup = tupla
                        .replaceAll("A", i)
                        .replaceAll("B", transicion.flood)
                        .replaceAll("C", transicion.objects)
                        .replaceAll("D", transicion.alert);
                    newJson.workspaceElements.cpnet[0].globbox[0].block
                        .find((x) => x.$.id === "ID1494615515")
                        .ml.forEach((item) => {
                            if (item._.includes(transicion.transicion + "S")) {
                                item._ = item._.replace(
                                    transicion.transicion + "S",
                                    tup
                                );
                            }
                        });
                }
                if(request.body.origen == 11){
                    newJson.workspaceElements.cpnet[0].globbox[0].block
                        .find((x) => x.$.id === "ID1494615515")
                        .ml.forEach((item) => {
                            if (item._.includes('val I111 =0`(6,2,[(11,"o")],0) ;')) {
                                item._ = item._.replace('val I111 =0`(6,2,[(11,"o")],0) ;', 'val I111 =100`('+request.body.destino+','+request.body.tipoVehiculo+',[(11,"o")],0) ;');
                            }
                        });
                }else if(request.body.origen == 12){
                    newJson.workspaceElements.cpnet[0].globbox[0].block
                        .find((x) => x.$.id === "ID1494615515")
                        .ml.forEach((item) => {
                            if (item._.includes('val I127=0`(6,2,[(12,"o")],0) ;')) {
                                item._ = item._.replace('val I127=0`(6,2,[(12,"o")],0) ;', 'val I111 =100`('+request.body.destino+','+request.body.tipoVehiculo+',[(12,"o")],0) ;');
                            }
                        });
                }
                const builder = new xml2js.Builder({
                    headless: true,
                    renderOpts: { pretty: true, indent: " ", newline: "\n" },
                });
                let cpnXml = builder.buildObject(newJson);
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
                                body = {
                                    addStep: 50000,
                                    untilStep: 0,
                                    untilTime: 0,
                                    addTime: 0,
                                    amount: 50000,
                                };
                                axios
                                    .post(
                                        simulatorHost +
                                            "/api/v2/cpn/sim/step_fast_forward",
                                        body,
                                        config
                                    )
                                    .then((res) => {
                                        response.send(
                                            res.data["tokensAndMark"].find(
                                                (x) => x.id === "ID1497673622"
                                            )
                                        );
                                    });
                            });
                    });
            })
            
        });
    });
});

app.post(
    "/guardarEvaluacion",
    (req, res) => {
        sistema.guardarEvaluacion(req.body.datos, function (error, result) {
            res.send({ error: error});
        });
    }
)

app.get(
    "/protegida",
    passport.authenticate("jwt", { session: false }),
    (req, res) => {
        res.send("Ruta protegida");
    }
);

//Inicio app
app.listen(PORT, () => {
    console.log(`App está escuchando en el puerto ${PORT}`);
});
