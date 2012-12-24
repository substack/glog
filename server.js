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
console.dir(req.connection.pair.credentials);
    if (/[^\?]+\.git/.test(req.url)) {
        res.statusCode = 401;
        res.setHeader('www-authenticate', [
            'httpsec/1.0 initialize',
            'id=localhost:5000',
            'dh=+NcclW9y2I3W9X5Vy+5v5lAy4X56y+Ncrwrtv5lqe',
            'certificate=http://localhost:5000/cert.pem',
            'token=mCa5tx1vKBY',
            'auth=vpCNmx7MZ7iqgkzIe0HWwfyrOMeqwg0TdbpwefI',
            'signature=2pX3SNgzWkV3w0W9y2X5V23hhy+5b8DQmo'
        ].join('\n    '));
        res.end();
        //repos.handle(req, res);
    }
    else ecstatic(req, res);
});
server.listen(5000);
