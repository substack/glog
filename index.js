var pushover = require('pushover');
var markdown = require('marked');
var git = require('git-file');
var through = require('through');
var JSONStream = require('JSONStream');
var split = require('split');
var qs = require('querystring');
var encode = require('ent').encode;

var exec = require('child_process').exec;
var run = require('comandante');
var OrderedEmitter = require('ordered-emitter');

var inherits = require('inherits');
var EventEmitter = require('events').EventEmitter;

var fs = require('fs');
var path = require('path');
var timestamp = require('internet-timestamp');

module.exports = function (repodir, opts) {
    if (typeof repodir === 'object') {
        opts = repodir;
        repodir = opts.repodir;
    }
    if (!opts) opts = {};
    opts.repodir = repodir;

    if(opts.highlight) {
        markdown.setOptions({
            highlight: opts.highlight
        });
    }
    
    var glog = new Glog(opts);
    var handle = glog.handle.bind(glog);
    
    Object.keys(Glog.prototype).forEach(function (key) {
        handle[key] = Glog.prototype[key].bind(glog);
    });
    return handle;
};

function Glog (opts) {
    if (!(this instanceof Glog)) return new Glog(opts);
    var self = this;
    
    self.options = opts;
    self.repo = pushover(opts.repodir);
    self.repodir = opts.repodir + '/blog.git';
    self.authfile = opts.repodir + '/users.json';
    
    self.repo.on('push', function (push) {
        requireAuth(push);
    });
    
    self.repo.on('fetch', function (dup) {
        if (dup.repo !== 'blog.git') dup.reject()
        else dup.accept()
    });
    
    function requireAuth (dup) {
        dup.setHeader('www-authenticate', 'basic');
        var auth = authFor(dup);
        dup.once('reject', function () {
            dup.end('ACCESS DENIED');
        });
        
        self.users(function (err, users) {
            if (err) return dup.reject(500);
            if (!users) {
                return dup.accept(); // admin party
            }
            if (!auth) return dup.reject(401);
            
            if (!users[auth.user]) return dup.reject(401);
            if (users[auth.user] !== auth.pass) return dup.reject(401);
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
    rss : /^\/blog\.xml(?:\?(.*)|$)/,
    html : /^\/blog\/([^?]+\.html)(\?|$)/,
    markdown : /^\/blog\/([^?]+\.(?:md|markdown))(\?|$)/,
    users : /^\/blog\/_\/users(\?|$)/,
    useradd : /^\/blog\/_\/useradd\/([^?]+)/,
    userdel : /^\/blog\/_\/userdel\/([^?]+)/
};

Glog.prototype.users = function (cb) {
    fs.readFile(this.authfile, function (err, data) {
        if (err) return cb(null, null);
        try { var users = JSON.parse(data) }
        catch (err) { return cb(err) }
        cb(null, users);
    });
};

Glog.prototype.userAdd = function (user, cb) {
    var token = Math.floor(Math.random() * Math.pow(16, 8)).toString(16);
    this.userMod(mod, function (err) {
        if (err) return cb(err);
        cb(null, token);
    });
    function mod (users) { users[user] = token }
};

Glog.prototype.userDel = function (user, cb) {
    this.userMod(mod, function (err) {
        if (err) return cb(err);
        cb(null);
    });
    function mod (users) { delete users[user] }
};

Glog.prototype.userMod = function (f, cb) {
    var self = this;
    if (!cb) cb = function () {};
    
    this.users(function (err, users) {
        if (err) return cb(err);
        if (!users) users = {};
        users = f(users) || users;
        
        var src = JSON.stringify(users, null, 2);
        fs.writeFile(self.authfile, src, function (err) {
            if (err) cb(err)
            else cb(null)
        });
    });
};

Glog.prototype._requireAuth = function (req, res, cb) {
    this.users(function (err, users) {
        if (err) {
            res.statusCode = 500;
            res.end(String(err) + '\n');
        }
        if (!users) return cb({}); // admin party
        
        var auth = authFor(req);
        if (!auth || users[auth.user] !== auth.pass) {
            res.statusCode = 401;
            res.end('ACCESS DENIED\n');
            return;
        }
        else cb(users);
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
    else if (m = routes.rss.exec(req.url)) {
        res.setHeader('content-type', 'application/rss+xml');
        self.rss().pipe(res);
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
    else if (routes.users.test(req.url)) {
        self._requireAuth(req, res, function (users) {
            var names = Object.keys(users || {});
            res.end(names.join('\n') + (names.length ? '\n' : ''));
        });
    }
    else if (m = routes.useradd.exec(req.url)) {
        self._requireAuth(req, res, function () {
            self.userAdd(m[1], function (err, token) {
                if (err) {
                    res.statusCode = 500;
                    res.end(String(err));
                    return;
                }
                res.end(token + '\n');
            });
        });
    }
    else if (m = routes.userdel.exec(req.url)) {
        self._requireAuth(req, res, function () {
            self.userDel(m[1], function (err) {
                if (err) {
                    res.statusCode = 500;
                    res.end(String(err));
                    return;
                }
                else res.end('removed user \n' + m[1]);
            });
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

Glog.prototype.rss = function (opts) {
    if (!opts) opts = {};
    var rss = through();
    rss.pause();
    rss.queue('<?xml version="1.0" encoding="utf-8"?>\n');
    rss.queue('<feed xmlns="http://www.w3.org/2005/Atom">\n');
    
    var site = opts.id || this.options.id;
    if (site) rss.queue('<id>' + encode(site) + '</id>\n');
    if (opts.title || this.options.title) {
        rss.queue(
            '<title>'
            + encode(opts.title || this.options.title)
            + '</title>\n'
        );
    }
    
    process.nextTick(rss.resume.bind(rss));
    
    var ls = this.list();
    ls.on('error', function (err) {
        res.statusCode = 500;
        res.end(String(err));
    });
    
    var first = true;
    ls.pipe(this.inline('html')).pipe(through(write, end));
    return rss;
    
    function write (doc) {
        if (first) {
            rss.queue('<updated>' + encode(timestamp(doc.date)) + '</updated>');
        }
        
        first = false;
        var href = doc.title.replace(/\W+/g, '_');
        var id = (site ? site : '').replace(/\/+$/, '') + '/' + href;
        rss.queue([
            '<entry>',
            '<title>' + encode(doc.title) + '</title>',
            '<link rel="self" href="/' + encode(href) + '" />',
            '<id>' + encode(id) + '</id>',
            '<author>',
                '<name>' + encode(doc.author) + '</name>',
                '<email>' + encode(doc.email) + '</email>',
            '</author>',
            '<updated>' + encode(timestamp(doc.date)) + '</updated>',
            '<content type="html">' + encode(doc.body) + '</content>',
            '</entry>',
            ''
        ].join('\n'));
    }
    
    function end () {
        rss.queue('</feed>\n');
        rss.queue(null);
    }
};
