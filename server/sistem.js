const Datos =  require('./cad.js');
const bcrypt = require('bcrypt');

class Sistem {

    constructor() {
        this.test = false;
        this.cad = new Datos();
        if(!this.test){
            this.cad.conectar(function(){
                console.log("Conectado a la base de datos");
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
                            callback({ "email": usr.email, "error": null});
                        } else {
                            callback({ "nick": null, "error": -4 });
                        }
                    }
                );
            } else {
                callback({ "nick": null, "error": -3 });
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
                callback(null, -3);
            }
        });
    }
}

module.exports = Sistem;