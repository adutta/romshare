// Expose modules in ./support for demo purposes
require.paths.unshift(__dirname + '/../../support');
path = require('path');
fs = require('fs');

/**
 * Module dependencies.
 */

var express = require('express')
  , form = require('connect-form');

var app = express.createServer(
  // connect-form (http://github.com/visionmedia/connect-form)
  // middleware uses the formidable middleware to parse urlencoded
  // and multipart form data
  form({ keepExtensions: true })
);

var romDir = process.env.HOME + "/roms";

returnNoRoms = function(res) {
  res.send( { "result": [] });
}

app.get('/', function(req, res) {
  var device = req.query['device'];
  if (device == null) {
    returnNoRoms(res);
    return;
  }

  fs.readdir(romDir + '/' + device, function(err, files) {
    if (files == null) {
      returnNoRoms(res);
      return;
    }
    
    var fileDict = {};
    for (var file in files) {
      file = files[file];
      var stat = fs.statSync(romDir + '/' + device + '/' + file);
      fileDict[file] = stat;
    }
    
    res.send({ "result": fileDict });
  });
});

app.get('/upload', function(req, res){
  res.send('<form method="post" enctype="multipart/form-data" action="/upload">'
    + '<p>Name: <input type="text" name="name" /></p>'
    + '<p>Image: <input type="file" name="rom" /></p>'
    + '<p><input type="submit" value="Upload" /></p>'
    + '</form>');
});

app.post('/upload', function(req, res, next){
  req.form.parse(req, function(err, fields, files) {
    console.log(fields);
      });
          
  // connect-form adds the req.form object
  // we can (optionally) define onComplete, passing
  // the exception (if any) fields parsed, and files parsed
  req.form.complete(function(err, fields, files){
    if (err) {
      next(err);
    } else {
      try {
        console.log('\nuploaded %s to %s'
                ,  files.rom.filename
                , files.rom.path);
      }
      catch (ex) {
      }
      res.redirect('back');
    }
  });
  
  req.form.on('error', function(err){
      req.resume();
  });

  // We can add listeners for several form
  // events such as "progress"
  req.form.on('progress', function(bytesReceived, bytesExpected){
    var percent = (bytesReceived / bytesExpected * 100) | 0;
    process.stdout.write('Uploading: %' + percent + '\r');
  });
  
  // Adjust where the file is saved.
  req.form.on('fileBegin', function(name, file) {
    var filename = '';
    for (var i = 0; i < 32; i++) {
      filename += Math.floor(Math.random() * 16).toString(16);
    }
    filename += path.extname(file.name);
    
    var prefix = process.env.DEPLOYFU_S3FS_PUBLIC_DIR == null ? '/tmp/' : process.env.DEPLOYFU_S3FS_PUBLIC_DIR + '/';
    filename = prefix + filename;
    console.log(filename);
    file.path = filename;
  });
});

var listenPort = process.env.PORT == null ? 3000 : parseInt(process.env.PORT);
app.listen(listenPort);
console.log('Express app started on port ' + listenPort);
