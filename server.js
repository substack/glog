var http = require('http');
var legit = require('./')(__dirname + '/repo');
var ecstatic = require('ecstatic')(__dirname + '/static');

var server = http.createServer(function (req, res) {
    if (legit.capture(req.url)) {
        legit(req, res);
    }
    else ecstatic(req, res);
});
server.listen(5000);
