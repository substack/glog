#!/usr/bin/env node
var fs = require('fs');
var path = require('path');
var spawn = require('child_process').spawn;
var exec = require('child_process').exec;
var run = require('comandante');
var url = require('url');
var EventEmitter = require('events').EventEmitter;

var argv = require('optimist').argv;
var cmd = argv._[0];
var mkdirp = require('mkdirp');

if (cmd === 'publish') {
    var file = argv._[1];
    var title = argv._.slice(2).join(' ');
    console.log('# git tag ' + file + ' -m ' + JSON.stringify(title));
    spawn('git', [ 'tag', file, '-m', title ], { stdio : [ 0, 1, 2 ] });
}
else if (cmd === 'useradd') {
    var user = argv._[1] || process.env.USER;
    var t = authTransform(function (users, remote) {
        var token = randomHex();
        users[user] = { token : token };
        
        var u = url.parse(remote);
        var uri = u.protocol + '//' + user + ':' + token
            + '@' + u.host + u.pathname.replace(/auth.git$/, 'blog.git')
        ;
        
        t.on('exit', function () {
            console.log([
                'Created user ' + user,
                'To publish as this user add this remote:',
                '', uri, ''
            ].join('\n'));
        });
        
        return users;
    });
    t.on('error', error);
}
else if (cmd === 'users' || cmd === 'token') {
    var tmpdir = createTempDir();
    var authdir = path.join(tmpdir, 'auth');
    
    fetchAuthRemote(function (err, remote) {
        if (err) return error(err);
        
        var ps = spawn('git', [ 'clone', remote ], { cwd : tmpdir });
        ps.on('exit', function (code) {
            if (code !== 0) return console.log('{}');
            var userfile = path.join(authdir, 'users.json');
            if (!fs.existsSync(userfile)) {
                return console.log('{}');
            }
            var users = JSON.parse(fs.readFileSync(userfile));
            if (cmd === 'users') {
                console.log(Object.keys(users).join('\n'));
            }
            else if (cmd === 'token' && !argv._[1]) {
                error('usage: glog token USER');
            }
            else if (cmd === 'token') {
                var user = argv._[1];
                if (!users[user]) {
                    error('no such user ' + user);
                }
                else console.log(users[user].token)
            }
        });
    });
}
else {
    fs.createReadStream(path.join(__dirname, '/usage.txt'))
        .pipe(process.stdout)
    ;
}

function error (msg) {
    console.error(msg);
    process.exit(1);
}

function randomHex () {
    return Math.floor(Math.random() * Math.pow(16, 8)).toString(16);
}

function fetchAuthRemote (cb) {
    if (argv.remote) return cb(
        null, 
        argv.remote.replace(/\/blog\.git$/, '/auth.git')
    );
    
    exec('git remote -v', function (err, stdout, stderr) {
        if (err) return cb(err);
        var m = /(https?:\/\/\S+\/blog\.git)\b/.exec(stdout);
        if (!m) return cb('no blog.git http remote');
        var remote = m[1].replace(/\/blog\.git$/, '/auth.git');
        cb(null, remote);
    });
}

function createTempDir () {
    var dir = path.join(
        process.env.TEMP || process.env.TEMPDIR
        || process.env.TEMPDIR || '/tmp',
        randomHex()
    );
    mkdirp.sync(dir);
    return dir;
}

function authTransform (cb) {
    var tmpdir = createTempDir();
    var dir = path.join(tmpdir, 'auth');
    var self = new EventEmitter;
    
    fetchAuthRemote(function (err, remote) {
        if (err) return self.emit('error', err);
        
        var ps = spawn('git', [ 'clone', remote ], { cwd : tmpdir });
        ps.on('exit', function (code) {
            if (code === 0) return userMod(remote);
            mkdirp.sync(dir);
            var ps = spawn('git', [ 'init' ], { cwd : dir });
            ps.on('exit', function (code) {
                if (code !== 0) return self.emit('error', 
                    'exit code ' + code + ' while doing git init'
                );
                userMod(remote);
            });
        });
    });
    
    return self;
    
    function userMod (remote) {
        var userfile = path.join(dir, 'users.json');
        var users = {};
        if (fs.existsSync(userfile)) {
            var src = fs.readFileSync(userfile);
            users = JSON.parse(src);
        }
        users = cb(users, remote);
        fs.writeFileSync(userfile, JSON.stringify(users, null, 2));
        addAuthFile(remote);
    }
    
    function addAuthFile (remote) {
        var ps = spawn('git', [ 'add', 'users.json' ], { cwd : dir });
        ps.on('exit', function (code) {
            if (code !== 0) return self.emit('error',
                'exit code ' + code + ' while adding users.json'
            );
            commitAuthFile(remote);
        });
    }
    
    function commitAuthFile (remote) {
        var ps = spawn('git',
            [ 'commit', '-m', 'modified users.json' ],
            { cwd : dir }
        );
        ps.on('exit', function (code) {
            if (code !== 0) return self.emit('error',
                'exit code ' + code + ' while committing'
            );
            pushAuthFile(remote);
        });
    }
    
    function pushAuthFile (remote) {
        var ps = spawn('git', [ 'push', remote, 'master' ], { cwd : dir });
        ps.on('exit', function (code) {
            if (code !== 0) return self.emit('error',
                'exit code ' + code + ' pushing to the origin'
            );
            self.emit('exit', code);
        });
    }
}
