var pushover = require('pushover');
var markdown = require('marked');
var git = require('git-file');
var through = require('through');
var JSONStream = require('JSONStream');
var split = require('split');
var qs = require('querystring');

var exec = require('child_process').exec;
var run = require('comandante');
var OrderedEmitter = require('ordered-emitter');

var inherits = require('inherits');
var EventEmitter = require('events').EventEmitter;

var fs = require('fs');
var path = require('path');

module.exports = function (repodir) {
    var glog = new Glog(repodir);
    var handle = glog.handle.bind(glog);
    
    Object.keys(Glog.prototype).forEach(function (key) {
        handle[key] = Glog.prototype[key].bind(glog);
    });
    return handle;
};

function Glog (repodir) {
    if (!(this instanceof Glog)) return new Glog(repodir);
    var self = this;
    
    self.repo = pushover(repodir);
    self.repodir = repodir + '/blog.git';
    self.authdir = repodir + '/auth.git';
    
    self.repo.on('push', function (push) {
        if (push.repo === 'auth.git') {
            push.once('accept', function () {
                self._userCache = null;
            });
        }
        requireAuth(push);
    });
    
    self.repo.on('fetch', function (dup) {
        if (dup.repo === 'auth.git') requireAuth(dup)
        else dup.accept()
    });
    
    function requireAuth (dup) {
        var auth = authFor(dup);
        dup.once('reject', function () {
            dup.setHeader('www-authenticate', 'basic');
            dup.end('ACCESS DENIED');
        });
        
        self._getUsers(function (err, users) {
            if (err) return dup.reject(500);
            if (!users) {
                return dup.accept(); // admin party
            }
            if (!auth) return dup.reject(401);
            
            if (!users[auth.user]) return dup.reject(401);
            if (users[auth.user].token !== auth.pass) return dup.reject(401);
            dup.accept();
        });
    }
}

function authFor (req) {
    if (!req.headers) return undefined;
    var m = /^basic (\S+)/i.exec(req.headers.authorization);
    if (!m) return undefined;
    var s = Buffer(m[1], 'base64').toString();
    return {
        user: s.split(':')[0],
        pass: s.split(':')[1]
    };
}

inherits(Glog, EventEmitter);

var routes = {
    git : /^\/blog\.git\b/,
    auth : /^\/auth\.git\b/,
    json : /^\/blog\.json(?:\?(.*)|$)/,
    html : /^\/blog\/([^?]+\.html)(\?|$)/,
    markdown : /^\/blog\/([^?]+\.(?:md|markdown))(\?|$)/
};

Glog.prototype._getUsers = function (cb) {
    var self = this;
    if (self._userCache) return cb(null, self._userCache);
    
    var us = git.read('HEAD', 'users.json', { cwd : self.authdir });
    us.on('error', function () { cb(null, null) });
    
    var data = '';
    us.on('data', function (buf) { data += buf });
    us.on('end', function () {
        if (data === '') return cb(null, null)
        
        try { var users = JSON.parse(data) }
        catch (err) { return cb(err) }
        
        self._userCache = users;
        cb(null, users);
    });
};

Glog.prototype.handle = function (req, res) {
    var self = this;
    var m;
    
    if (routes.git.test(req.url) || routes.auth.test(req.url)) {
        self.repo.handle(req, res);
    }
    else if (m = routes.json.exec(req.url)) {
        var params = qs.parse(m[1]);
        var ls = self.list();
        ls.on('error', function (err) {
            res.statusCode = 500;
            res.end(String(err));
        });
        
        res.setHeader('content-type', 'application/json');
        
        if (['html','markdown'].indexOf(params.inline) >= 0) {
            ls.pipe(self.inline(params.inline))
                .pipe(JSONStream.stringify())
                .pipe(res)
            ;
        }
        else {
            ls.pipe(JSONStream.stringify()).pipe(res);
        }
    }
    else if (m = routes.html.exec(req.url)) {
        var s = self.read(m[1].replace(/\.html$/, '.markdown'));
        
        var data = '';
        s.on('data', function (buf) { data += buf });
        s.on('end', function () {
            res.setHeader('content-type', 'text/html');
            res.end(markdown.parse(data));
        });
        
        s.on('error', function (err) {
            res.statusCode = 500;
            res.end(String(err));
        });
    }
    else if (m = routes.markdown.exec(req.url)) {
        var s = self.read(m[1]);
        res.setHeader('content-type', 'text/plain');
        s.pipe(res);
        
        s.on('error', function (err) {
            res.statusCode = 500;
            res.end(String(err));
        });
    }
    else {
        req.statusCode = 404;
        res.end('not found');
    }
};

Glog.prototype.test = function (url) {
    return Object.keys(routes).some(function (key) {
        return routes[key].test(url);
    });
};

Glog.prototype.read = function (file) {
    return git.read('HEAD', file, { cwd : this.repodir });
};

Glog.prototype.list = function () {
    var opts = { cwd : this.repodir };
    
    fs.stat(this.repodir, function (err, stat) {
        if (err && err.code === 'ENOENT') {
            tr.emit('end');
        }
        else exec('git tag -l', opts, ontag);
    });
    
    function ontag (err, stdout, stderr) {
        if (err) return tr.emit('error', err);
        
        var args = [ 'show' ]
            .concat(stdout.split('\n'))
            .concat('--')
            .filter(Boolean)
        ;
        run('git', args, opts).pipe(split()).pipe(tr);
    }
    
    var tag = null, commit = null;
    var tr = through(write, end);
    var tags = [];
    
    return tr;
    
    function write (line) {
        var m;
        if (m = /^tag\s+(.+\.(?:markdown|md|html))/.exec(line)) {
            tag = { file : m[1] };
            if (commit) tag.commit = commit;
        }
        else if (m = /^commit\s+(\S+)/.exec(line)) {
            commit = m[1];
            if (tag) pushTag();
        }
        
        if (!tag) return;
        
        if (tag.date && !tag.title && /\S/.test(line)) {
            tag.title = line;
            if (tag && commit) pushTag();
        }
        else if (m = /^Tagger:\s+(.+)/.exec(line)) {
            var s = /(.+) <(.+?)>/.exec(m[1]);
            if (s) {
                tag.author = s[1];
                tag.email = s[2];
            }
            else tag.author = m[1]
        }
        else if (m = /^Date:\s+(.+)/.exec(line)) {
            tag.date = m[1];
        }
    }
    
    function end () {
        tags.sort(sorter).forEach(function (t) { tr.queue(t) });
        tr.queue(null);
    }
    function sorter (a, b) {
        return (new Date(b.date)).valueOf() - (new Date(a.date)).valueOf();
    }
    
    function pushTag () {
        tag.commit = commit;
        tags.push(tag);
        tag = null;
        commit = null;
    }
};

Glog.prototype.inline = function (format) {
    var self = this;
    var em = new OrderedEmitter;
    em.on('data', function (doc) {
        tr.emit('data', doc.value);
        if (--pending === 0 && ended) {
            tr.emit('end');
        }
    });
    var order = 0;
    var pending = 0;
    var ended = false;
    
    var tr = through(write, end);
    return tr;
    
    function write (doc) {
        var s = self.read(doc.file);
        var n = order ++;
        pending ++;
        
        var data = '';
        s.on('data', function (buf) { data += buf });
        s.on('end', function () {
            doc.body = ({
                html : markdown.parse,
                markdown : String
            }[format] || String)(data);
            
            em.emit('data', { order : n, value : doc });
        });
    }
    
    function end () {
        ended = true;
        if (pending === 0) tr.emit('end');
    }
};
