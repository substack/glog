#!/usr/bin/env node
var fs = require('fs');
var path = require('path');
var spawn = require('child_process').spawn;

var argv = require('optimist').argv;
var cmd = argv._[0];

if (cmd === 'publish') {
    var file = argv._[1];
    var title = argv._.slice(2).join(' ');
    console.log('# git tag ' + file + ' -m ' + JSON.stringify(title));
    spawn('git', [ 'tag', file, '-m', title ], { stdio : [ 0, 1, 2 ] });
}
else {
    fs.createReadStream(path.join(__dirname, '/usage.txt'))
        .pipe(process.stdout)
    ;
}
