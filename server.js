var http = require('http');
var legit = require('./')(process.argv[3]);
var ecstatic = require('ecstatic')(__dirname + '/static');

var server = http.createServer(function (req, res) {
    if (legit.test(req.url)) {
        legit(req, res);
    }
    else ecstatic(req, res);
});
server.listen(Number(process.argv[2]));
