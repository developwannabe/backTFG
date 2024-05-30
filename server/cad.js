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

    insertarGPT = function (datos, callback){
        this.db.actualizar("evaluaciones",datos,callback);
    }

    insertarFIS = function (datos, callback){
        this.db.actualizar("evaluaciones",datos,callback);
    }

    evaluarTransicion = function (datos, callback){
        this.db.actualizar("evaluaciones",datos,callback);
    }

    modificarUsuario = function (datos, callback) {
        this.db.actualizar("usuarios", datos, callback);
    }

    eliminarUsuario = function (datos, callback) {
        this.db.eliminar("usuarios", datos, callback);
    }

    insertarEvaluacion = function (datos, callback) {
        this.db.insertar("evaluaciones", datos, callback);
    }

    insertarEval = function (datos, callback) {
        this.db.actualizar("evaluaciones", datos, callback);
    }

    insertarTransiciones = function (datos, callback) {
        this.db.insertar("transiciones", datos, callback);
    }

    buscarEvaluacion = function (datos, callback){
        this.db.buscarUno("evaluaciones", {}, { sort: { "time" : -1 } }, callback);
    }

    ultimaEvaluacion = function (callback) {
        this.db.buscarUno("evaluaciones", {}, { sort: { "time" : -1 } }, callback);
    }

    obtenerTransiciones = function (callback) {
        this.db.buscarUno("transiciones", {}, { sort: { "time" : -1 } }, callback);
    }
    
    buscarUsuarios = function(filtro, callback){
        let input = filtro.input.replace(/a/gi, '[aá]').replace(/e/gi, '[eé]').replace(/i/gi, '[ií]').replace(/o/gi, '[oó]').replace(/u/gi, '[uú]');
        let regexFiltro = {
            $or: [
                { email: new RegExp(input, 'i') },
                { name: new RegExp(input, 'i') },
                { surname: new RegExp(input, 'i') }
            ]
        };
        this.db.buscar("usuarios", regexFiltro, callback);
    }
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
            this.colecciones["evaluaciones"] = this.db.collection("evaluaciones");
            this.colecciones["transiciones"] = this.db.collection("transiciones");
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

    buscarUno = function (coleccion, datos, opciones, callback) {
        this.colecciones[coleccion].findOne(datos, opciones, function (err, result) {
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
