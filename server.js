var https = require('https');
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
var opts = {
    cert : fs.readFileSync(__dirname + '/server-keys/cert.pem'),
    key : fs.readFileSync(__dirname + '/server-keys/key.pem'),
    ca : [ fs.readFileSync(__dirname + '/server-keys/csr.pem') ],
    requestCert : true
};

var server = https.createServer(opts, function (req, res) {
    if (/[^\?]+\.git/.test(req.url)) {
        repos.handle(req, res);
    }
    else ecstatic(req, res);
});
server.listen(5000);
