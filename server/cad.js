require('dotenv').config();
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
            console.log("Conexión a BBDD establecida correctamente.");
        } catch (error) {
            console.error("Fallo al conectar con BBDD:", error);
            callback(error);
        }
    }

    insertarUsuario = function (datos, callback) {
        let bd = this.db;
        this.buscarUsuario({ email: datos.email }, function(err, result) {
            if (err) {
                console.error("Error al buscar usuario:", err);
                callback(err);
            } else {
                if (result.length > 0) {
                    console.log("El usuario ya existe");
                    callback(-1, result);
                } else {
                    bd.insertar("usuarios", datos, callback);
                }
            }
        });
    }

    buscarUsuario = function (datos, callback) {
        this.db.buscar("usuarios", datos, callback);
    }
}

class BBDD {

    constructor() {
        this.db = null;
        this.colecciones = {};
    }

    conectar = async function (callback) {
        let client = new mongo(
            process.env.MONGO
        );
        await client.connect();
        this.db = client.db("sistema");
        this.colecciones["usuarios"] = this.db.collection("usuarios");
        this.colecciones["rutas"] = this.db.collection("rutas");
        callback();
    };

    insertar = function (coleccion, elemento, callback) {
        this.colecciones[coleccion].insertOne(elemento, function (err, result) {
            if (err) {
                console.log(-1, null);
            } else {
                console.log("Nuevo elemento creado");
                callback(null,result);
            }
        });
    };

    buscar = function (coleccion, datos, callback) {
        this.colecciones[coleccion].find(datos).toArray(function (err, result) {
            callback(err, result);
        });
    };

    eliminar = function (coleccion, datos, callback) {
        this.colecciones[coleccion].deleteOne(datos, function (err, result) {
            callback(err, result);
        });
    };

    actualizar = function (coleccion, datos, callback) {
        this.colecciones[coleccion].updateOne(datos[0], datos[1], function (err, result) {
            callback(err, result);
        });
    };
}

module.exports = Cad;