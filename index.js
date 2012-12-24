var Legit = require('./lib/legit');

module.exports = function (repodir) {
    var legit = new Legit(repodir);
    var handle = legit.handle.bind(legit);
    
    Object.keys(Legit.prototype).forEach(function (key) {
        handle[key] = Legit.prototype[key].bind(legit);
    });
    return handle;
};
