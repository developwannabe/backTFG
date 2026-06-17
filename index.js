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
const { Logging }  = require('@google-cloud/logging');
const monitoring   = require('@google-cloud/monitoring');
const { GoogleAuth } = require('google-auth-library');

const app = express();
app.use(cors());

const sistema = new Sistem();
module.exports.sistema = sistema;

require("./server/passport-config.js");
const numSteps = 50000;
const numTokens = 200;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

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
const MAPS = process.env.MAPS_URL;
const PROJECT_ID     = process.env.PROJECT_ID;
const ENDPOINT_ID    = process.env.ENDPOINT_ID;
const MODEL_ENDPOINT = process.env.MODEL_ENDPOINT;

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

app.get("/image/:type/:img", (req, res) => {
    utils.obtenerImagen(
        req.params.type + "/" + req.params.img,
        function (data) {
            res.send(data);
        }
    );
});

app.get("/image/:type/:idSession/:img", (req, res) => {
    utils.obtenerImagen(
        req.params.type +
            "/eval_" +
            req.params.idSession +
            "/" +
            req.params.img,
        function (data) {
            res.send(data);
        }
    );
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

app.get("/ruta/:origen/:destino", utils.rolUsuario, async (req, respuestaF) => {
    try {
        const { origen, destino } = req.params;

        const peticion = await sistema.insertarPeticionRuta(origen, destino);
        const ruta = await sistema.esperarRuta(peticion._id);

        if (!ruta || !ruta.ruta) {
            return respuestaF.send({ mapa: null });
        }

        const mapa = await axios.post(MAPS, { ruta: ruta.ruta }, {
            headers: { Authorization: "Bearer " + GPT_TOKEN }
        });

        const eta = ruta.tiempo_base != null ? Math.round(ruta.tiempo_base) : null;
        respuestaF.send({ mapa: mapa.data, ruta: ruta.ruta, coste: ruta.coste, eta });

    } catch (error) {
        console.error("Error en /ruta/:origen/:destino:", error.message);
        respuestaF.send({ mapa: null });
    }
});

app.get("/lugares", utils.rolUsuario, (req, res) => {
    sistema.obtenerLugares(function (error, result) {
        res.send({ error: error, lugares: result });
    });
});

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

app.get("/evaluaciones", utils.rolEvaluador, (req, res) => {
    sistema.obtenerEvaluaciones(function (error, result) {
        res.send({ error: error, evaluaciones: result });
    });
});

app.get("/fisTransiciones/:idSession", utils.rolEvaluador, async (req, res) => {
    let pet = {};
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
                    magnitude: eval.magnitude / 10.0,
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

app.get("/finalizarEvaluacion/:id", utils.rolEvaluador, (req, res) => {
    sistema.finalizarEvaluacion(req.params.id, function (error, result) {
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
    if (req.params.id == "0") {
        sistema.obtenerTransiciones(function (error, transiciones) {
            let tiempo = new Date().getTime();
            let tr = [];
            utils.obtenerUser(req, function (user) {
                eval = {
                    time: tiempo,
                    user: user,
                    evaluacion: {},
                    magnitude: parseInt(MAGNITUDE),
                    finalizada: false,
                };
                transiciones.transiciones.forEach((transicion) => {
                    tr.push(transicion.id);
                    eval.evaluacion["info4" + transicion.id] = {
                        flood: null,
                        objects: null,
                        fis: null,
                        gpt: {
                            flood: null,
                            objects: null,
                        },
                    };
                });
                sistema.guardarEvaluacion(eval, function (error, result) {
                    res.send({
                        id: tiempo,
                        transiciones: tr,
                        magnitude: parseInt(MAGNITUDE),
                    });
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
    sistema.obtenerEvaluacion(req.params.id, function (error, result) {
        res.send({ error: error, result: result });
    });
});

app.get(
    "/evalImage/:idEval/:transicion",
    utils.rolEvaluador,
    async (req, res) => {
        if (req.params.transicion) {
            utils.existeImagen(
                "imgEval/eval_" +
                    req.params.idEval +
                    "/" +
                    req.params.transicion +
                    ".png",
                function (existe) {
                    if (existe) {
                        sistema.buscarGPT(
                            req.params.idEval,
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
                                                    "info4" +
                                                        req.params.transicion
                                                ].objects,
                                        });
                                    }
                                );
                            }
                        );
                        return;
                    }

                    try {
                        utils.obtenerImagen(
                            "imgVias/" + req.params.transicion + ".jpg",
                            async function (img) {
                                let form = new FormData();
                                form.append(
                                    "file",
                                    img,
                                    req.params.transicion + ".jpg"
                                );
                                const gpt = await axios.post(
                                    GPT,
                                    { lugares: [req.params.transicion] },
                                    {
                                        headers: {
                                            Authorization:
                                                "Bearer " + GPT_TOKEN,
                                        },
                                    }
                                );
                                sistema.insertarGPT(
                                    req.params.idEval,
                                    req.params.transicion,
                                    gpt.data[req.params.transicion],
                                    async function () {
                                        const response = await axios.post(
                                            YOLO,
                                            form,
                                            {
                                                headers: form.getHeaders(),
                                                responseType: "arraybuffer",
                                            }
                                        );

                                        utils.guardarImagen(
                                            "imgEval/eval_" +
                                                req.params.idEval +
                                                "/" +
                                                req.params.transicion +
                                                ".png",
                                            response.data,
                                            function (result) {
                                                res.send({
                                                    status: true,
                                                    GPT: gpt.data[
                                                        req.params.transicion
                                                    ],
                                                });
                                            }
                                        );
                                    }
                                );
                            }
                        );
                    } catch (error) {
                        console.log(error);
                        res.status(500).send({ error: error.message });
                    }
                }
            );
        } else {
            res.status(400).send({ error: "Transición no especificada" });
        }
    }
);

app.get("/explain/:transicion", utils.rolEvaluador, async (req, res) => {
    try {
        const imgBuffer = await new Promise((resolve, reject) => {
            utils.obtenerImagen("imgVias/" + req.params.transicion + ".jpg", (data) => {
                data ? resolve(data) : reject(new Error("Imagen no encontrada"));
            });
        });

        const b64 = imgBuffer.toString("base64");

        const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
        const client = await auth.getClient();
        const { token } = await client.getAccessToken();

        const response = await axios.post(
            `https://europe-west1-aiplatform.googleapis.com/v1/${MODEL_ENDPOINT}:predict`,
            { instances: [{ image: b64, explain: true }] },
            { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, timeout: 60000 }
        );

        const prediction = (response.data.predictions || [])[0] || {};
        res.json(prediction);
    } catch (e) {
        console.error("Error en /explain/:transicion:", e.message);
        res.status(500).json({ error: e.message });
    }
});

app.get("/api/metrics", utils.rolAdmin, async (req, res) => {
    try {
        const logging = new Logging({ projectId: PROJECT_ID });
        const hours   = parseInt(req.query.hours) || 24;
        const since   = new Date(Date.now() - hours * 3600 * 1000).toISOString();

        const [entries] = await logging.getEntries({
            filter: `resource.type="aiplatform.googleapis.com/Endpoint" resource.labels.endpoint_id="${ENDPOINT_ID}" jsonPayload.message=~"event.*prediction" timestamp>="${since}"`,
            orderBy: 'timestamp desc',
            pageSize: 200,
        });

        const logs = [];
        for (const entry of entries) {
            const msg = entry.data?.message || '';
            try {
                const data = JSON.parse(msg.slice(msg.indexOf('{')));
                if (data.event === 'prediction') {
                    data.logged_at = entry.metadata.timestamp;
                    logs.push(data);
                }
            } catch (_) {}
        }

        const total          = logs.length;
        const transitable    = logs.filter(l => l.label === 'transitable').length;
        const no_transitable = total - transitable;
        const avg_confidence = total
            ? Math.round((logs.reduce((s, l) => s + (l.confidence || 0), 0) / total) * 10000) / 10000
            : 0;
        const xai_requests = logs.filter(l => l.explain).length;

        const by_hour = {};
        for (const l of logs) {
            const hour = (l.timestamp || '').slice(0, 13);
            by_hour[hour] = (by_hour[hour] || 0) + 1;
        }

        res.json({
            total, transitable, no_transitable,
            avg_confidence, xai_requests,
            by_hour: Object.fromEntries(Object.entries(by_hour).sort()),
            recent:  logs.slice(0, 20),
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get("/api/performance", utils.rolAdmin, async (req, res) => {
    try {
        const client  = new monitoring.MetricServiceClient();
        const hours   = parseInt(req.query.hours) || 24;
        const now     = Math.floor(Date.now() / 1000);
        const start   = now - hours * 3600;

        async function query(metricType) {
            const [timeSeries] = await client.listTimeSeries({
                name:     client.projectPath(PROJECT_ID),
                filter:   `metric.type="${metricType}" AND resource.labels.endpoint_id="${ENDPOINT_ID}"`,
                interval: {
                    startTime: { seconds: start },
                    endTime:   { seconds: now },
                },
                view: 'FULL',
            });
            return timeSeries.flatMap(s =>
                s.points.map(p => {
                    const v = p.value;
                    let value = 0;
                    if (v.distributionValue && v.distributionValue.count > 0) {
                        value = v.distributionValue.mean;
                    } else if (v.doubleValue != null && v.doubleValue !== 0) {
                        value = v.doubleValue;
                    } else if (v.int64Value != null) {
                        value = Number(v.int64Value);
                    }
                    return { time: Number(p.interval.endTime.seconds), value };
                })
            ).sort((a, b) => a.time - b.time);
        }

        const [latency, requests, errors, cpu, replicas] = await Promise.all([
            query("aiplatform.googleapis.com/prediction/online/prediction_latencies"),
            query("aiplatform.googleapis.com/prediction/online/prediction_count"),
            query("aiplatform.googleapis.com/prediction/online/error_count"),
            query("aiplatform.googleapis.com/prediction/online/cpu/utilization"),
            query("aiplatform.googleapis.com/prediction/online/replicas"),
        ]);

        res.json({ latency, requests, errors, cpu, replicas });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get("/api/torchserve_logs", utils.rolAdmin, async (req, res) => {
    try {
        const logging = new Logging({ projectId: PROJECT_ID });
        const since   = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

        const [entries] = await logging.getEntries({
            filter:   `resource.type="aiplatform.googleapis.com/Endpoint" resource.labels.endpoint_id="${ENDPOINT_ID}" timestamp>="${since}"`,
            orderBy:  'timestamp desc',
            pageSize: 100,
        });

        res.json(entries.map(e => ({
            timestamp: e.metadata.timestamp,
            severity:  e.metadata.severity,
            message:   e.data?.message || String(e.data || ''),
        })));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => {
    console.log(`App está escuchando en el puerto ${PORT}`);
});
