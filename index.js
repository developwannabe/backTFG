const express = require("express");
const app = express();
const axios = require("axios");
const env = require("dotenv");
const fs = require("fs");
const xml2js = require("xml2js");
const xmlBeautifier = require("xml-beautifier");

env.config();

const PORT = process.env.PORT || 3000;

const simulatorHost = process.env.SIMULATOR_HOST;

function generateSessionId() {
    const id = "CPN_IDE_SESSION_" + new Date().getTime();
    return id;
}

app.use(express.static(__dirname + "/"));

app.get("/", function (request, response) {
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/plain");
    response.end("Hola Mundo!");
});

app.listen(PORT, () => {
    console.log(`App está escuchando en el puerto ${PORT}`);
    console.log("Ctrl+C para salir");
});

app.get("/hola", function (request, response) {
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
                    response.send(res.data);
                });
        });
    });
});

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
                                    response.send(res.data["tokensAndMark"].find(x => x.id === "ID1497673622"));
                                });
                        });
                });
        });
    });
});
