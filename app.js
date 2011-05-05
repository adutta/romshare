// Expose modules in ./support for demo purposes
require.paths.unshift(__dirname + '/../../support');
path = require('path');
fs = require('fs');
http = require('http');
url = require('url');
sprintf = require('sprintf').sprintf;
querystring = require('querystring');
cookies = require('cookies');
keygrip = require('keygrip');

var cookieKeys = new keygrip(["oiajsdoijaoijhq398han"]);

/**
 * Module dependencies.
 */

ajax = function(urlStr, callback) {
  u = url.parse(urlStr);
  http.get({ host: u.host, port: u.port, path: u.pathname},
    function(res) {
      var data = '';
      res.on('data', function(chunk) {
        data += chunk;
      });
      res.on('end', function() {
        callback(eval("stuff = " + data));
      });
    });
}

var manifest = null;

loadData = function() {
  try {
    eval('manifest = ' + fs.readFileSync('manifest.js'));
  }
  catch (err) {
    manifest = {
      version: 1,
      roms: []
    };
    saveData();
  }
}

saveData = function() {
  fs.writeFileSync('manifest.js', JSON.stringify(manifest));
}

loadData();

var express = require('express')
  , form = require('connect-form');

var app = express.createServer(
  // connect-form (http://github.com/visionmedia/connect-form)
  // middleware uses the formidable middleware to parse urlencoded
  // and multipart form data
  form({ keepExtensions: true })
);

var openid = require("openid");

var relyingParty = null;

isLoggedIn = function(req, res) {
  var c = new cookies( req, res, cookieKeys );
  email = c.get('email', {signed: true});
  return email != null;
}

doLogin = function(req, res) {
  if (isLoggedIn(req, res))
    return;
  var extensions = [new openid.UserInterface(), 
                    new openid.SimpleRegistration(
                        {
                          "nickname" : true, 
                          "email" : true, 
                          "fullname" : true,
                          "dob" : true, 
                          "gender" : true, 
                          "postcode" : true,
                          "country" : true, 
                          "language" : true, 
                          "timezone" : true
                        }),
                    new openid.AttributeExchange(
                        {
                          "http://axschema.org/contact/email": "required",
                          "http://axschema.org/namePerson/friendly": "required",
                          "http://axschema.org/namePerson": "required"
                        })];

  if (!relyingParty) {
    relyingParty = new openid.RelyingParty(
        'http://' + req.headers.host + '/google_verify', // Verification URL (yours)
        null, // Realm (optional, specifies realm for OpenID authentication)
        false, // Use stateless verification
        false, // Strict mode
        extensions); // List of extensions to enable and include
  }

  // Resolve identifier, associate, and build authentication URL
  relyingParty.authenticate('http://www.google.com/accounts/o8/id', false, function(authUrl)
      {
        if (!authUrl)
        {
          res.send('fail');
        }
        else
        {
          res.redirect(authUrl);
        }
      });
  return false;
}

// Request an OAuth Request Token, and redirects the user to authorize it
app.get('/google_login', function(req, res) {
  doLogin(req, res);
});

app.get('/google_verify', function(req, res) {
  // Verify identity assertion
  // NOTE: Passing just the URL is also possible
  relyingParty.verifyAssertion(req, function(result)
  {
    // Result contains properties:
    // - authenticated (true/false)
    // - error (message, only if not authenticated)
    // - answers from any extensions (e.g. 
    //   "http://axschema.org/contact/email" if requested 
    //   and present at provider)
    var c = new cookies( req, res, cookieKeys );
    c.set("email", result["http://axschema.org/contact/email"], {signed: true});
    res.redirect('/upload');
    //res.send((result.authenticated ? 'Success :)' : 'Failure :(') + '\n\n' + JSON.stringify(result));
  });
});

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

app.get('/clear', function(req, res){
  var c = new cookies( req, res, cookieKeys );
  email = c.set('email', null, {signed: true});
  res.send('cookie cleared');
});

app.get('/upload', function(req, res){
  if (!isLoggedIn(req, res)) {
    res.send(sprintf("You must <a href='/google_login'>log in.</a>"));
    return;
  }
  ajax("http://gh-pages.clockworkmod.com/ROMManagerManifest/devices.js?test=shit",
    function(data) {
      var devices = data.devices;
      var options = "";
      options += sprintf('<option value="%s">%s</option>', 'None', 'None');
      for (var device in devices) {
        device = devices[device];
        options += sprintf('<option value="%s">%s</option>', device.key, device.name)
      }
      res.send('<form method="post" enctype="multipart/form-data" action="/upload">'
        + '<p>ROM Name: <input type="text" name="name" /></p>'
        + '<p>Device: <select name="device">' + options + '</select></p>'
        + '<p>Image: <input type="file" name="rom" /></p>'
        + '<p><input type="submit" value="Upload" /></p>'
        + '</form>');
        });
});

app.post('/upload', function(req, res, next){
  var romName;
  var device;
  req.form.on('field', function(name, value) {
    if (name == 'name' && value != '') {
      romName = value;
    }
    if (name == 'name' && value != '' && value != 'None') {
      device = value;
    }
  });

  // connect-form adds the req.form object
  // we can (optionally) define onComplete, passing
  // the exception (if any) fields parsed, and files parsed
  req.form.complete(function(err, fields, files){
    if (romName == null || device == null)
      return;
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
      res.send("Uploaded " + romName);
    }
  });
  
  req.form.on('error', function(err){
    if (romName != null)
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
    if (romName == null || device == null) {
      console.log('no name or device provided');
      req.connection.destroy();
      return;
    }
    console.log('file upload starting');
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
