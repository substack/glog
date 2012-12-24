# glog

git push blog server

note: auth is not yet baked in

# example

## custom http server

You can whip up a custom http server or use the default server that glog comes
with using `glog server`. Here's what a custom server could look like:

``` js
var http = require('http');
var glog = require('glog')(__dirname + '/repo');
var ecstatic = require('ecstatic')(__dirname + '/static');

var server = http.createServer(function (req, res) {
    if (glog.test(req.url)) {
        glog(req, res);
    }
    else ecstatic(req, res);
});
server.listen(5000);
```

## git push glog

First run the glog server (or your own server using the glog api),
storing blog repo data in `~/data/blog-repo`:

```
$ glog server 5000 ~/data/blog-repo
```

Now create a new git repo for articles and set up the remote to point at your
glog server:

```
$ git init
$ git remote add publish http://localhost:5000/blog.git
```

Write an article in markdown,
create an annotated tag for the article,
and push to the git blog server:

```
$ echo -e '# beep\nboop' > robot.markdown
$ glog publish robot.markdown 'this is the title text'
$ git push publish master --tags
```

Now the content should be live on your blog, yay!

# methods

```  js
var glog = require('glog')
```

## var blog = glog(repodir)

Create a new `blog` handle using `repodir` to store git blog data.

## blog(req, res)

Handle the `(req, res)` in order to serve blog.json and blog.git.

## blog.list()

Return a readable stream of blog article filenames.

## blog.read(file)

Return a readable stream with the contents of `file`.

## blog.inline(format)

Return a through stream you can pipe `blog.list()` to that will inline article
contents rendered in `format`: either `'html'` or `'markdown'`.

## blog.test(req.url)

Return whether or not to defer to `blog` for handling routes.

# usage

```
usage:

  glog server PORT REPODIR

    Create a glog server listening on PORT and storing repos in REPODIR.

  glog publish FILE "TITLE..."

    Publish FILE with TITLE by creating an annotated tag.

```

# install

With [npm](https://npmjs.org), to get the `glog` command do:

```
npm install -g glog
```

and to get the library do:

```
npm install glog
```

# license

MIT
