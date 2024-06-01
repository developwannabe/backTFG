require("dotenv").config();
const jwt = require("jsonwebtoken");
const { Storage } = require('@google-cloud/storage');

const storage = new Storage();

const crearToken = function (email, rol) {
    const token = jwt.sign({ "email": email, "rol": rol }, process.env.JWTSECRET, {
        expiresIn: "10h",
    });
    return token;
};

const comprobarDatos = function (req, res, next) {
    if (req.body.email && req.body.password) {
        if (regexEmail(req.body.email) === false){
            res.send({ error: -1 });
            return;
        }
        next();
    } else {
        res.send({ error: -2 });
    }
};

const obtenerImagen = function(ruta,callback){
    const bucket = storage.bucket("img-back");
    const file = bucket.file(ruta);
    file.download().then((data) => {
        callback(data[0]);
    }).catch((err) => {
        callback(null);
    });
}

const guardarImagen = function(ruta,imagen,callback){
    const bucket = storage.bucket("img-back");
    const file = bucket.file(ruta);
    file.save(imagen).then(() => {
        callback(true);
    }).catch((err) => {
        console.log(err);
        callback(false);
    });
}

const existeImagen = function(ruta,callback){
    const bucket = storage.bucket("img-back");
    const file = bucket.file(ruta);
    file.exists().then((data) => {
        callback(data[0]);
    }).catch((err) => {
        callback(false);
    });
}

const regexEmail = function(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

const extraerPayload = function(token) {
    return jwt.verify(token, process.env.JWTSECRET);
}

const comprobarRol = function(req,rol) {
    const bearerToken = req.headers.authorization;
    if (!bearerToken || !bearerToken.startsWith("Bearer ")) {
        return false;
    }
    const token = bearerToken.split(" ")[1];
    const payload = extraerPayload(token);
    if (payload.rol === rol) {
        return true;
    } else {
        return false;
    }
}

const rolAdmin = function(req, res, next) {
    if(comprobarRol(req, "admin")){
        next();
        return;
    }
    res.sendStatus(403);
}

const rolEvaluador = function(req, res, next) {
    if(comprobarRol(req, "evaluador")){
        next();
        return;
    }
    res.sendStatus(403);
}

const rolUsuario = function(req, res, next) {
    if(comprobarRol(req, "usuario")){
        next();
        return;
    }
    res.sendStatus(403);
}

module.exports = {
    crearToken,
    comprobarDatos,
    rolAdmin,
    rolEvaluador,
    rolUsuario,
    regexEmail,
    obtenerImagen,
    guardarImagen,
    existeImagen
};
