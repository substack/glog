# legit

git push blog server

note: auth is not yet baked in

# example

First run the legit server (or your own server using the legit api),
storing blog repo data in `~/data/blog-repo`:

```
$ legit server 5000 ~/data/blog-repo
```

Now create a new git repo for articles and set up the remote to point at your
legit server:

```
$ git init
$ git remote add publish http://localhost:5000/blog.git
```

Write an article in markdown,
create an annotated tag for the article,
and push to the git blog server:

```
$ echo -e '# beep\nboop' > robot.markdown
$ legit publish robot.markdown 'this is the title text'
$ git push publish master --tags
```

Now the content should be live on your blog, yay!

# methods

```  js
var legit = require('legit')
```

## var blog = legit(repodir)

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

  legit server PORT REPODIR

    Create a legit server listening on PORT and storing repos in REPODIR.

  legit publish FILE "TITLE..."

    Publish FILE with TITLE by creating an annotated tag.

```

# install

With [npm](https://npmjs.org), to get the `legit` command do:

```
npm install -g legit
```

and to get the library do:

```
npm install legit
```

# license

MIT
