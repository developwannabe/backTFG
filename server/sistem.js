const Datos = require("./cad.js");
const bcrypt = require("bcrypt");
const utils = require("./utils.js");

class Sistem {
    constructor() {
        this.test = false;
        this.cad = new Datos();
        if (!this.test) {
            this.cad.conectar(function () {
                console.log("Conexión a BBDD establecida correctamente.");
            });
        }
    }

    toString() {
        return this.cad.toString();
    }

    iniciarSesion = function (obj, callback) {
        this.cad.buscarUsuario({ email: obj.email }, function (error, result) {
            if (error) {
                callback(null);
                return;
            }
            let usr = result[0];
            if (usr) {
                bcrypt.compare(
                    obj.password,
                    usr.password,
                    function (err, hash) {
                        if (hash) {
                            callback({
                                email: usr.email,
                                rol: usr.rol,
                                error: null,
                            });
                        } else {
                            callback({ nick: null, error: -4 });
                        }
                    }
                );
            } else {
                callback({ nick: null, error: -3 });
            }
        });
    };

    registrarUsuario = function (datos, callback) {
        let cadT = this.cad;
        cadT.buscarUsuario({ email: datos.email }, function (error, result) {
            if (error) {
                callback(null, error);
                return;
            }
            if (result.length == 0) {
                bcrypt.hash(datos.password, 10, function (err, hash) {
                    if (err) {
                        callback(null, err);
                        return;
                    }
                    datos.password = hash;
                    cadT.insertarUsuario(datos, function (error, result) {
                        if (error) {
                            callback(null, error);
                            return;
                        }
                        callback(datos.email, null);
                    });
                });
            } else {
                callback(null, -1);
            }
        });
    };

    guardarEvaluacion = function (evaluacion, callback) {
        for (let i = 0; i < evaluacion.length; i++) {
            evaluacion[i].time = Math.floor(Math.random() * 10) + 1;
        }
        let evalG = {
            time: new Date().getTime(),
            evaluacion: evaluacion,
        };
        this.cad.insertarEvaluacion(evalG, function (error, result) {
            if (error) {
                callback(error, null);
                return;
            }
            callback(null, result);
        });
    };

    ultimaEvaluacion = function (callback) {
        this.cad.ultimaEvaluacion(function (error, result) {
            if (error) {
                callback(error, null);
                return;
            }
            callback(null, result);
        });
    };

    obtenerLugares = function (callback) {
        this.cad.obtenerLugares(function (error, result) {
            if (error) {
                callback(error, null);
                return;
            }
            callback(null, result);
        });
    };

    buscarUsuario = function (datos, callback) {
        this.cad.buscarUsuario(datos, function (error, result) {
            if (error) {
                callback(error, null);
                return;
            }
            console.log(result);
            callback(null, {
                nombre: result[0].name,
                apellidos: result[0].surname,
                email: result[0].email,
                rol: result[0].rol,
            });
        });
    };

    eliminarUsuario = function (datos, callback) {
        this.cad.eliminarUsuario(datos, function (error, result) {
            if (error) {
                callback(error, null);
                return;
            }
            callback(null, result);
        });
    };

    modificarUsuario = async function (datos, callback) {
        let mod = {};
        let dat = [];
        if (datos.datos.nombre) {
            mod["name"] = datos.datos.nombre;
        }
        if (datos.datos.apellidos) {
            mod["surname"] = datos.datos.apellidos;
        }
        if (datos.datos.rol) {
            if (
                datos.datos.rol == "admin" ||
                datos.datos.rol == "evaluador" ||
                datos.datos.rol == "personal"
            ) {
                mod["rol"] = datos.datos.rol;
            }else{
                callback(-1, null);
                return;
            }
        }
        if (datos.datos.password) {
            mod["password"] = await bcrypt.hash(datos.datos.password, 10);
        }
        mod = { $set: mod };
        dat = [{ email: datos.email }, mod];
        this.cad.modificarUsuario(dat, function (error, result) {
            if (error) {
                callback(error, null);
                return;
            }
            callback(null, result);
        });
    };

    buscarUsuarios = function (filtro, callback) {
        this.cad.buscarUsuarios(filtro, function (error, result) {
            if (error) {
                callback(error, null);
                return;
            }
            let usuarios = [];
            result.forEach((user) =>
                usuarios.push({
                    nombre: user.name,
                    apellidos: user.surname,
                    email: user.email,
                    rol: user.rol,
                })
            );
            callback(null, usuarios);
        });
    };
}

module.exports = Sistem;
