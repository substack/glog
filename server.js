var http = require('http');
var pushover = require('pushover');
var mkdirp = require('mkdirp');

mkdirp.sync('/tmp/legit');
var repos = pushover('/tmp/legit');
var ecstatic = require('ecstatic')(__dirname + '/static');

repos.on('push', function (push) {
    console.log(push.repo + '/' + push.commit);
    push.accept();
});

var fs = require('fs');

var server = http.createServer(opts, function (req, res) {
    if (/[^\?]+\.git/.test(req.url)) {
        repos.handle(req, res);
    }
    else ecstatic(req, res);
});
server.listen(5000);
