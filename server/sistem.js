const Datos =  require('./cad.js');

class Sistem {

    constructor() {
        this.cad = new Datos();
    }

    toString() {
        return this.cad.toString();
    }
}

module.exports = Sistem;