require("dotenv").config();
var mongo = require("mongodb").MongoClient;
class Cad {
    constructor() {
        this.usuarios = null;
        this.db = null;
    }

    conectar = async function (callback) {
        try {
            this.db = new BBDD();
            await this.db.conectar(callback);
        } catch (error) {
            console.error("Fallo al conectar con BBDD:", error);
            callback(error);
        }
    };

    insertarUsuario = function (datos, callback) {
        this.db.insertar("usuarios", datos, callback);
    };

    buscarUsuario = function (datos, callback) {
        this.db.buscar("usuarios", datos, callback);
    };
}

class BBDD {
    constructor() {
        this.db = null;
        this.colecciones = {};
    }

    conectar = async function (callback) {
        try {
            let client = new mongo(process.env.MONGO);
            await client.connect();
            this.db = client.db("sistema");
            this.colecciones["usuarios"] = this.db.collection("usuarios");
            this.colecciones["rutas"] = this.db.collection("rutas");
            callback();
        } catch (error) {
            console.error("Fallo al conectar con BBDD:", error);
        }
    };

    insertar = function (coleccion, elemento, callback) {
        this.colecciones[coleccion].insertOne(elemento, function (err, result) {
            if (err) {
                throw err;
            } else {
                callback(null, result);
            }
        });
    };

    buscar = function (coleccion, datos, callback) {
        this.colecciones[coleccion].find(datos).toArray(function (err, result) {
            if (err) {
                throw err;
            } else {
                callback(null, result);
            }
        });
    };

    eliminar = function (coleccion, datos, callback) {
        this.colecciones[coleccion].deleteOne(datos, function (err, result) {
            if (err) {
                throw err;
            } else {
                callback(null, result);
            }
        });
    };

    actualizar = function (coleccion, datos, callback) {
        this.colecciones[coleccion].updateOne(
            datos[0],
            datos[1],
            function (err, result) {
                if (err) {
                    throw err;
                } else {
                    callback(null, result);
                }
            }
        );
    };
}

module.exports = Cad;
