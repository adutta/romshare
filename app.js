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
mysql = new require('mysql').Client();
path = require('path');


mysql.host = process.env.DEPLOYFU_MYSQL_HOST == null ? 'localhost' : process.env.DEPLOYFU_MYSQL_HOST;
mysql.user = process.env.DEPLOYFU_MYSQL_USER == null ? 'root' : process.env.DEPLOYFU_MYSQL_USER;
mysql.password = process.env.DEPLOYFU_MYSQL_PASSWORD == null ? 'nignog' : process.env.DEPLOYFU_MYSQL_PASSWORD;
mysql.connect(function(err) {
  if (err)
    console.log(err);
});

mysql.query(sprintf('use %s', process.env.DEPLOYFU_MYSQL_DATABASE == null ? 'romshare' : process.env.DEPLOYFU_MYSQL_DATABASE));

mysql.query('create table if not exists developer (id int primary key not null auto_increment, name varchar(32), developerId varchar(32), icon varchar(256), summary varchar(256), homepage varchar(256))');
mysql.query('create table if not exists rom ('
                + "id int primary key not null auto_increment"
                + ", developerId int, index(developerId)"
                + ", name varchar(32)"
                + ", device varchar(32), index(device)"
                + ", filename varchar(256)"
                + ", summary varchar(256)"
                + ", product varchar(32)"
                + ", incremental varchar(8)"
                + ", modversion varchar(64))");

var cookieKeys = new keygrip([process.env.DEPLOYFU_MYSQL_PASSWORD == null ? 'bleepbloopbingblang' : process.env.DEPLOYFU_MYSQL_PASSWORD]);

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

getManifest = function(req, res) {
  var query = 'select distinct developer.*, rom.device from rom, developer where rom.developerId = developer.id';
  var mysqlArgs = [];
  if (req.params.device) {
    query += ' and rom.device=? or rom.device="all"';
    mysqlArgs.push(req.params.device);
  }
  var manifest = { minversion: 2000, manifests: [] };
  developers = {};
  mysql.query(query, mysqlArgs, function(err, results, fields) {
    if (err) {
      res.send(manifest);
      return;
    }
    for (var i in results) {
      result = results[i];
      existingResult = developers[result.developerId];
      if (!existingResult) {
        result.id = result.developerId;
        var device = result.device;
        delete result.developerId;
        delete result.device;
        developers[result.id] = result;
        manifest.manifests.push(result);
        existingResult = result;
        existingResult.roms = {}
        existingResult.roms[device] = true;
      }
      else {
        existingResult.roms[result['device']] = true;
      }
    }
    console.log(manifest);
    res.send(manifest);
  });
}

app.get('/manifest/:device/:developer', function(req, res) {
  var query = 'select rom.* from rom, developer where developer.id=rom.developerId and rom.device = ? or rom.device= "all"';
  var manifest = { version: 1, roms: [] };
  mysql.query(query, [req.params.device], function(err, results, fields) {
    if (err) {
      res.send(manifest);
      return;
    }
    for (var i in results) {
      var rom = results[i];
      delete rom.id;
      delete rom.developerId;
      delete rom.device;
      rom.url = "http://" + req.headers.host + "/download/" + rom.filename;
      delete rom.filename;
      manifest.roms.push(rom);
    }
    
    res.send(manifest);
  });
});

app.get('/manifest/:device', function(req, res) {
  getManifest(req, res);
});

app.get('/manifest', function(req, res) {
  getManifest(req, res);
});

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
    if (result.authenticated) {
      var c = new cookies( req, res, cookieKeys );
      var email = result["http://axschema.org/contact/email"].toLowerCase();
      mysql.query("select id from developer where developerId = ?", [email], function(err, results, fields) {
        if (err) {
          res.send('error during lookup of user info.');
          return;
        }
        
        if (results.length == 0) {
          mysql.query('insert into developer (name, developerId) values (?, ?)', [email, email], function (err, results, fields) {
            c.set("email", email, {signed: true});
            c.set("id", results.id, {signed: true});
            res.redirect('/upload');
          });
        }
        else {
          c.set("email", email, {signed: true});
          c.set("id", results[0].id, {signed: true});
          res.redirect('/upload');
        }
      });
    }
    else {
      res.send('bad auth');
    }
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
  email = c.set('id', null, {signed: true});
  res.send('cookie cleared');
});

app.get('/upload', function(req, res){
  if (!isLoggedIn(req, res)) {
    res.send(sprintf("You must <a href='/google_login'>log in.</a>"));
    return;
  }
  ajax("http://gh-pages.clockworkmod.com/ROMManagerManifest/devices.js",
    function(data) {
      var devices = data.devices;
      var options = "";
      options += sprintf('<option value="%s">%s</option>', 'None', 'None');
      for (var device in devices) {
        device = devices[device];
        options += sprintf('<option value="%s">%s</option>', device.key, device.name)
      }
      res.send('<form method="post" enctype="multipart/form-data" action="/upload">'
        + '<div>ROM Name:</div><div><input type="text" name="name" /></div>'
        + '<div>Device:</div><div><select name="device">' + options + '</select></div>'
        + '<div>Description:</div><div><textarea name="summary" rows="2" cols="80"> </textarea></div>'
        + '<div>ro.modversion (optional):</div><div><input type="text" name="modversion" /></div>'
        + '<div>Product (optional):</div><div><input type="text" name="product" /></div>'
        + '<div>Version (optional):</div><div><input type="text" name="incremental" /></div>'
        + '<div>Image:</div><div><input type="file" name="rom" /></div>'
        + '<div><input type="submit" value="Upload" /></div>'
        + '</form>');
        });
});

app.post('/upload', function(req, res, next) {
  var c = new cookies( req, res, cookieKeys );
  var developerId = c.get('id', {signed: true});
  if (email == null) {
    req.connection.destroy();
    return;
  }
  var requiredProperties = ['name', 'device', 'summary'];
  var rom = { developerId: developerId };
  req.form.on('field', function(name, value) {
    if (value != '' && value != null && value != 'None') {
      rom[name] = value;
    }
  });

  verifyRequiredProperties = function() {
    for (var prop in requiredProperties) {
      prop = requiredProperties[prop];
      //console.log(prop + ": " + rom[prop]);
      if (rom[prop] == null) {
        console.log("missing: " + prop);
        return false;
      }
    }
    return true;
  }

  // connect-form adds the req.form object
  // we can (optionally) define onComplete, passing
  // the exception (if any) fields parsed, and files parsed
  req.form.complete(function(err, fields, files){
    if (!verifyRequiredProperties())
      return;
    if (err) {
      next(err);
    } else {
      try {
        console.log('\nuploaded %s to %s'
                ,  files.rom.filename
                , files.rom.path);
                
        var columns = [];
        var actualValues = [];
        var values = [];
        for (var column in rom) {
          columns.push(column);
          values.push('?');
          actualValues.push(rom[column]);
        }
        columns = columns.join(',');
        values = values.join(',');
        var sqlString = sprintf("insert into rom (%s) values (%s)", columns, values);
        mysql.query(sqlString, actualValues);
      }
      catch (ex) {
      }
      res.send("Uploaded " + rom.name);
    }
  });
  
  req.form.on('error', function(err){
    if (verifyRequiredProperties())
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
    if (!verifyRequiredProperties()) {
      req.connection.destroy();
      res.send('missing required properties');
      console.log('missing required properties of ' + requiredProperties);
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
    rom.filename = path.basename(filename);
  });
});

var listenPort = process.env.PORT == null ? 3000 : parseInt(process.env.PORT);
app.listen(listenPort);
console.log('Express app started on port ' + listenPort);
