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
        var auth = req.headers.authorization;
        var m = /^Basic (\S+)/i.exec(auth);
        if (!auth || !m) return authenticate();
        
        var s = Buffer(m[1], 'base64').toString().split(':');
        var user = s[0], pass = s[1];
        if (pass === '') return authenticate();
        
        if (user !== 'substack' || pass !== 'pow') {
            res.statusCode = 403;
            res.setHeader('www-authenticate', 'basic');
            res.end('not authorized');
            return;
        }
        console.dir([ user, pass ]);
        //repos.handle(req, res);
    }
    else ecstatic(req, res);
    
    function authenticate () {
        res.statusCode = 401;
        res.setHeader('www-authenticate', 'basic');
        res.end('authenticate');
    }
});
server.listen(5000);
