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
                callback({ "nick": null, "error": error });
                return;
            }
            let usr = result[0];
            if (usr) {
                bcrypt.compare(
                    obj.password,
                    usr.password,
                    function (err, hash) {
                        if (hash) {
                            callback({ "nick": usr.nick,  "error": null});
                        } else {
                            callback({ "nick": null, "error": -2 });
                        }
                    }
                );
            } else {
                callback({ "nick": null, "error": -1 });
            }
        });
    };

    registrarUsuario = function (datos, callback) {
        this.cad.insertarUsuario(datos, function (error,result){
            if(error){
                callback(null, error);
            }else{
                callback(datos.email, null);
            }
        });
    }
}

module.exports = Sistem;