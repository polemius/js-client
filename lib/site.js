if (typeof(require) !== 'undefined') {
  var glob   = require("glob"),
      path   = require("path"),
      crypto = require("crypto"),
      fs     = require("fs");
}

var Site = function(client, attributes) {
  for (var key in attributes) {
    this[key] = attributes[key]
  }

  this.client = client;
};

var globFiles = function(dir, cb) {
  glob("**/*", {cwd: dir}, function(err, files) {
    if (err) return cb(err);

    var filtered = files.filter(function(file) {
      return file.match(/(\/__MACOSX|\/\.)/) ? false : true;
    }).map(function(file) { return {rel: file, abs: path.resolve(dir, file)}; });

    filterFiles(filtered, cb);
  });
};

var filterFiles = function(filesAndDirs, cb) {
  var processed = [],
      files     = [],
      cbCalled  = false;
  filesAndDirs.forEach(function(fileOrDir) {
    fs.lstat(fileOrDir.abs, function(err, stat) {
      if (cbCalled) return null;
      if (err) { cbCalled = true; return cb(err); }
      if (stat.isFile()) {
        files.push(fileOrDir);
      }
      processed.push(fileOrDir);
      if (processed.length == filesAndDirs.length) {
        cb(null, files);
      }
    });
  });
};

var calculateShas = function(files, cb) {
  var shas = {},
      cbCalled = false,
      processed = [];

  files.forEach(function(file) {
    fs.readFile(file.abs, function(err, data) {
      if (cbCalled) return null;
      if (err) { cbCalled = true; return cb(err); }

      var shasum = crypto.createHash('sha1');
      shasum.update(data);
      shas[file.rel] = shasum.digest('hex');
      processed.push(file);
      if (processed.length == files.length) {
        cb(null, shas);
      }
    });
  });
};

var createFromDir = function(client, dir, siteId, cb) {
  var fullDir = dir.match(/^\//) ? dir : process.cwd() + "/" + dir;

  globFiles(fullDir, function(err, files) {
    calculateShas(files, function(err, filesWithShas) {
      client.request({
        url: "/sites" + (siteId ? "/" + siteId : ""),
        type: siteId ? "put" : "post",
        body: JSON.stringify({
          files: filesWithShas
        })
      }, function(err, data) {
        if (err) return cb(err);
        var site = new Site(client, data);
        var shas = {};
        data.required.forEach(function(sha) { shas[sha] = true; });
        var filtered = files.filter(function(file) { return shas[filesWithShas[file.rel]]; });
        site.uploadFiles(filtered, function(err, site) {
          cb(err, site);
        });
      });
    });
  });
};

Site.createFromDir = function(client, dir, cb) {
  createFromDir(client, dir, null, cb);
};

Site.prototype = {
  isReady: function() {
    return this.state == "current";
  },
  refresh: function(cb) {
    var self = this;
    this.client.request({
      url: "/sites/" + this.id
    }, function(err, data, client) {
      if (err) return cb(err);
      Site.call(self, client, data);
      cb(null, self);
    });
  },
  
  uploadFiles: function(files, cb) {
    console.log("State " + this.state +", uploading ", files);
    if (this.state !== "uploading") return cb(null, this);
    if (files.length == 0) { return this.refresh(cb); }

    var self = this,
        cbCalled = false,
        uploaded = [];
    
    files.forEach(function(file) {
      fs.readFile(file.abs, function(err, data) {
        if (cbCalled) return null;
        if (err) { cbCalled = true; return cb(err); }

        console.log("Upload request for", file);

        self.client.request({
          url: "/sites/" + self.id + "/files/" + file.rel,
          type: "put",
          body: data,
          contentType: "application/octet-stream",
          ignoreResponse: true
        }, function(err) {
          console.log("Uploaded ", file);
          if (cbCalled) return null;
          if (err) { cbCalled = true; return cb(err); }
          uploaded.push(file);
        
          if (uploaded.length == files.length) {
            self.refresh(cb);
          }
        });
      });
    });
  }
};

exports.Site = Site;