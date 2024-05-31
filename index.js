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
const FormData = require("form-data");
const path = require("path");
const { time } = require("console");

const sistema = new Sistem();
module.exports.sistema = sistema;

require("./server/passport-config.js");
const app = express();
const numSteps = 50000;
const numTokens = 200;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(
    cors({
        origin: process.env.FRONT_URL,
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
const lambda_eval = process.env.LAMBDA_EVAL;
const YOLO = process.env.YOLO_URL;
const GPT = process.env.GPT_URL;
const GPT_TOKEN = process.env.GPT_TOKEN;
const MAGNITUDE = process.env.MAGNITUDE;

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
        let tkn = utils.crearToken(email, req.user.rol);
        res.send({ tkn: tkn, email: email, rol: req.user.rol });
    }
);

app.post(
    "/registrarUsuario",
    utils.comprobarDatos,
    utils.rolAdmin,
    function (req, res) {
        sistema.registrarUsuario(
            {
                name: req.body.nombre,
                surname: req.body.apellidos,
                email: req.body.email,
                password: req.body.password,
                rol: req.body.rol,
            },
            function (nick, error) {
                res.send({ email: nick, error: error });
            }
        );
    }
);

app.get("/usuario/:email", utils.rolAdmin, (req, res) => {
    const email = req.params.email;
    sistema.buscarUsuario({ email: email }, function (error, result) {
        if (error) {
            res.send({ error: error });
            return;
        }
        res.send(result);
    });
});

app.patch("/usuario", utils.rolAdmin, (req, res) => {
    sistema.modificarUsuario(req.body, function (error, result) {
        if (error) {
            res.send({ error: error });
            return;
        }
        res.send(result);
    });
});

app.get("/fisTransiciones/:idSession", utils.rolEvaluador, (req, res) => {
    let pet = {};
    let respt = {};
    sistema.obtenerEvaluacion(
        req.params.idSession,
        async function (error, eval) {
            pet["paths"] = [];
            let magnitude = 60;
            let keys = Object.keys(eval.evaluacion);
            for (let i = 0; i < keys.length; i++) {
                pet["paths"].push({
                    path: keys[i].slice(5),
                    flood: eval.evaluacion[keys[i]].flood,
                    objects: eval.evaluacion[keys[i]].objects,
                    magnitude: parseInt(MAGNITUDE),
                });
            }
            await axios
                .post(lambda_eval, pet, {
                    headers: { Authorization: "Bearer " + GPT_TOKEN },
                })
                .then((resp) => {
                    let keys = Object.keys(resp.data);
                    for (let i = 0; i < keys.length; i++) {
                        sistema.insertarFIS(
                            keys[i],
                            req.params.idSession,
                            Math.round(resp.data[keys[i]]),
                            function () {
                                if (i == keys.length - 1) {
                                    sistema.obtenerEvaluacion(
                                        req.params.idSession,
                                        function (error, eval) {
                                            res.send(eval);
                                        }
                                    );
                                }
                            }
                        );
                    }
                });
        }
    );
});

app.delete("/usuario", utils.rolAdmin, (req, res) => {
    sistema.eliminarUsuario(
        { email: req.body.email },
        function (error, result) {
            if (error) {
                res.send({ error: error });
                return;
            }
            res.send(result);
        }
    );
});

app.post("/buscarUsuarios", utils.rolAdmin, (req, res) => {
    sistema.buscarUsuarios(req.body, function (error, result) {
        res.send({ error: error, usuarios: result });
    });
});

app.post("/cerrarSesion", function (req, res) {
    req.logout();
    res.send({ error: null });
});

//Simulación
app.post("/simular", (request, response) => {
    const filePath = "./nets/cadiz.cpn";
    if (request.body == null) {
        response.send({ error: "No se han enviado datos" });
        return;
    }
    if (request.body.origen != 11 && request.body.origen != 12) {
        response.send({ error: "No se ha enviado la petición correcta" });
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
            const tupla = "(A,B,C,D)";
            let tup;
            sistema.ultimaEvaluacion(function (err, eval) {
                if (err) {
                    console.error("Error al buscar la última evaluación:", err);
                    return;
                }
                for (let i = 0; i < eval.evaluacion.length; i++) {
                    transicion = eval.evaluacion[i];
                    tup = tupla
                        .replace("A", transicion.flood)
                        .replace("B", transicion.objects)
                        .replace("C", transicion.fis)
                        .replace("D", transicion.time);
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
                if (request.body.origen == 11) {
                    newJson.workspaceElements.cpnet[0].globbox[0].block
                        .find((x) => x.$.id === "ID1494615515")
                        .ml.forEach((item) => {
                            if (
                                item._.includes(
                                    'val I111 =0`(6,2,[(11,"o")],0) ;'
                                )
                            ) {
                                item._ = item._.replace(
                                    'val I111 =0`(6,2,[(11,"o")],0) ;',
                                    "val I111 =" +
                                        numTokens +
                                        "`(" +
                                        request.body.destino +
                                        "," +
                                        request.body.tipoVehiculo +
                                        ',[(11,"o")],0) ;'
                                );
                            }
                        });
                } else if (request.body.origen == 12) {
                    newJson.workspaceElements.cpnet[0].globbox[0].block
                        .find((x) => x.$.id === "ID1494615515")
                        .ml.forEach((item) => {
                            if (
                                item._.includes(
                                    'val I127=0`(6,2,[(12,"o")],0) ;'
                                )
                            ) {
                                item._ = item._.replace(
                                    'val I127=0`(6,2,[(12,"o")],0) ;',
                                    "val I111 =" +
                                        numTokens +
                                        "`(" +
                                        request.body.destino +
                                        "," +
                                        request.body.tipoVehiculo +
                                        ',[(12,"o")],0) ;'
                                );
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
                                    addStep: numSteps,
                                    untilStep: 0,
                                    untilTime: 0,
                                    addTime: 0,
                                    amount: numSteps,
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
            });
        });
    });
});

app.get("/transitabilidad/:id/:trn/:val", utils.rolEvaluador, (req, res) => {
    sistema.evaluarTransicionT(
        { id: req.params.id, trn: req.params.trn, val: req.params.val },
        function (error, result) {
            res.send(result);
        }
    );
});

app.post("/guardarEvaluacion", (req, res) => {
    sistema.guardarEvaluacion(req.body.datos, function (error, result) {
        res.send({ error: error });
    });
});

app.get(
    "/protegida",
    passport.authenticate("jwt", { session: false }),
    (req, res) => {
        res.send("Ruta protegida");
    }
);

app.get("/transiciones", utils.rolEvaluador, (req, res) => {});

app.post("/transiciones", utils.rolEvaluador, (req, res) => {
    sistema.insertarTransiciones(req.body, function (error, result) {
        if (error) {
            res.send({ error: error });
            return;
        }
        res.send(result);
    });
});

app.get("/iniciarEvaluacion/:id", utils.rolEvaluador, (req, res) => {
    if (
        req.params.id == 0 ||
        !fs.existsSync(`img/eval/eval_${req.params.id}`)
    ) {
        sistema.obtenerTransiciones(function (error, transiciones) {
            let tiempo = new Date().getTime();
            fs.mkdirSync(`img/eval/eval_${tiempo}`);
            let tr = [];
            eval = { time: tiempo, evaluacion: {}, finalizada: false};
            transiciones.transiciones.forEach((transicion) => {
                tr.push(transicion.id);
                eval.evaluacion["info4" + transicion.id] = {
                    flood: null,
                    objects: null,
                    magnitude: MAGNITUDE,
                    fis: null,
                    gpt: {
                        flood: null,
                        objects: null,
                    }
                };
            });
            sistema.guardarEvaluacion(eval, function (error, result) {
                res.send({
                    id: tiempo,
                    transiciones: tr,
                    magnitude: MAGNITUDE,
                });
            });
        });
    } else {
        sistema.obtenerEvaluacion(req.params.id, function (error, result) {
            if (error || result == null) {
                res.send({ error: error });
                return;
            }
            res.send({
                id: req.params.id,
                transiciones: Object.keys(result.evaluacion),
                magnitude: result.magnitude,
                evals: result.evaluacion,
            });
        });
    }
});

app.post("/evaluarTransicion", utils.rolEvaluador, (req, res) => {
    sistema.evaluarTransicion(req.body, function (error, result) {
        res.send({ error: error, result: result });
    });
});

app.get("/evaluacionRes/:id", utils.rolEvaluador, (req, res) => {
    console.log("p")
    sistema.obtenerEvaluacion(req.params.id, function (error, result) {
        res.send({ error: error, result: result });
    });
});

app.get(
    "/evalImage/:idEval/:transicion",
    utils.rolEvaluador,
    async (req, res) => {
        if (req.params.transicion) {
            const dirPath = path.join(
                __dirname,
                "img",
                "eval",
                `eval_${req.params.idEval}`
            );
            const filePath = path.join(dirPath, `${req.params.transicion}.png`);

            if (fs.existsSync(filePath)) {
                sistema.buscarGPT(
                    "1716999083898",
                    req.params.transicion,
                    function (result) {
                        sistema.obtenerEvaluacion(
                            req.params.idEval,
                            function (error, eval) {
                                res.send({
                                    status: true,
                                    GPT: result,
                                    flood: eval.evaluacion[
                                        "info4" + req.params.transicion
                                    ].flood,
                                    objects:
                                        eval.evaluacion[
                                            "info4" + req.params.transicion
                                        ].objects,
                                });
                            }
                        );
                    }
                );
                return;
            }

            try {
                let form = new FormData();
                form.append(
                    "file",
                    fs.createReadStream(
                        path.join(
                            __dirname,
                            "img",
                            `${req.params.transicion}.jpg`
                        )
                    )
                );
                const gpt = await axios.post(
                    GPT,
                    { lugares: [req.params.transicion] },
                    { headers: { Authorization: "Bearer " + GPT_TOKEN } }
                );
                sistema.insertarGPT(
                    req.params.idEval,
                    req.params.transicion,
                    gpt.data[req.params.transicion],
                    async function () {
                        const response = await axios.post(YOLO, form, {
                            headers: form.getHeaders(),
                            responseType: "arraybuffer",
                        });

                        if (!fs.existsSync(dirPath)) {
                            fs.mkdirSync(dirPath, { recursive: true });
                        }
                        fs.writeFile(filePath, response.data, (err) => {
                            if (err) {
                                console.error(
                                    "Error al escribir el archivo:",
                                    err
                                );
                                res.status(500).send({
                                    error: "Error al escribir el archivo",
                                });
                            } else {
                                res.send({
                                    status: true,
                                    GPT: gpt.data[req.params.transicion],
                                });
                            }
                        });
                    }
                );
            } catch (error) {
                console.log(error);
                res.status(500).send({ error: error.message });
            }
        } else {
            res.status(400).send({ error: "Transición no especificada" });
        }
    }
);

app.listen(PORT, () => {
    console.log(`App está escuchando en el puerto ${PORT}`);
});
