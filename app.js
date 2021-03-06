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
mysql = require('./model').mysql;
util = require('util');
exec = require('child_process').exec;
hashlib = require('hashlib');

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
        callback(null, eval("stuff = " + data));
      });
    }).on('error', function(error){
      callback(error, null);
    });
}


var express = require('express')
  , form = require('connect-form');

var app = express.createServer(
  form({ keepExtensions: true })
);

// Configuration
app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
});

app.configure('production', function(){
  app.use(express.errorHandler()); 
});

var openid = require("openid");

var relyingParty = null;

isLoggedIn = function(req, res) {
  var c = new cookies( req, res, cookieKeys );
  email = c.get('email', {signed: true});
  id = c.get('id', {signed: true});
  return email != null && id != null;
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
  relyingParty.authenticate('http://www.google.com/accounts/o8/id', false, function(error, authUrl)
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
  res.header('Cache-Control', 'max-age=300');
  var query = 'select distinct developer.*, rom.device from rom, developer where rom.developerId = developer.id and rom.visible = 1 and developer.visible = 1';
  var mysqlArgs = [];
  if (req.params.device) {
    query += ' and rom.device=? or rom.device="all"';
    mysqlArgs.push(req.params.device);
  }
  var manifest = { minversion: 2000, manifests: [] };
  var developers = {};
  mysql.query(query, mysqlArgs, function(err, results, fields) {
    if (err) {
      res.send(manifest);
      return;
    }
    console.log(results);

    var validResults = [];
    var callbackCount = 0;
    var manualCount = 0;
    for (var j in results) {
      if(!results[j].manifest){
        console.log(results[j]);
        validResults.push(results[j]);
      }
      else {
        manualCount++;
        ajax("http://jsonp.deployfu.com/clean/"+encodeURIComponent(results[j].manifest), function(e, data){
          callbackCount++;
          var errMsg = e ? e : (data.error ? data.error : null);
          if(!errMsg) {
            console.log(validResults);
            console.log(results[j]);
            validResults.push(results[j]);
          }

          if (callbackCount == manualCount) {
            console.log(validResults);
            for (var i in validResults) {
              var result = validResults[i];
              console.log(result);
              existingResult = developers[result.developerId];
              if (!existingResult) {
                result.developer = result.name;
                result.free = true;
                delete result.name;
                if (result.icon != null)
                  result.icon = getDistributionUrl(req, path.join(result.id.toString(), result.icon));
                else
                  delete result.icon;
                result.id = result.developerId;
                if (result.manifest == null)
                  result.manifest = "http://"  + req.headers.host + "/developer/" + result.developerId + "/manifest";
                var device = result.device;
                delete result.developerId;
                delete result.email;
                delete result.donate;
                delete result.homepage;
                delete result.visible;
                developers[result.id] = result;
                manifest.manifests.push(result);
                existingResult = result;
                if (!req.params.device)
                    existingResult.roms = {}
              }
              if (!req.params.device)
                existingResult.roms[result.device] = true;
              delete result.device;
            }
            res.send(manifest);
          }
        });
      }
    }
  });
}

app.get('/developer/:developerId/manifest', function(req, res) {
  var query = 'select rom.* from rom, developer where developer.developerId=? and developer.id=rom.developerId order by rom.id desc';
  var manifest = { version: 1, roms: [] };
  mysql.query("select * from developer where developerId=?", [req.params.developerId], function(err, results, fields) {
    if (results) {
      var dev = results[0];
      if (dev != null) {
        manifest.donate = dev.donate;
        manifest.homepage = dev.homepage;
      }
    }

    mysql.query("select screenshot.* from screenshot, developer where developer.developerId=? and screenshot.developerId=developer.id", [req.params.developerId], function(err, results, fields) {
      var screenshots = {};
      for (var screenshot in results) {
        screenshot = results[screenshot];
        var romShots = screenshots[screenshot.romId];
        if (romShots == null) {
          screenshots[screenshot.romId] = romShots = [];
        }
      
        romShots.push(getDistributionUrl(req, path.join(screenshot.developerId.toString(), screenshot.romId.toString(), screenshot.filename)));
      }

      mysql.query(query, [req.params.developerId], function(err, results, fields) {
        if (err) {
          res.send(err);
          return;
        }
        for (var i in results) {
          var rom = results[i];
          rom.url = getDistributionUrl(req, path.join(rom.developerId.toString(), rom.id.toString(), rom.filename));
          if (rom.visible != 0)
            delete rom.visible;
          else
            rom.visible = false;
          rom.incremental = rom.id;
          rom.screenshots = screenshots[rom.id];
          delete rom.id;
          delete rom.developerId;
          delete rom.filename;
          if (!rom.modversion || rom.modversion == '')
            rom.modversion = hashlib.md5(rom.url);
          manifest.roms.push(rom);
        }
        res.send(manifest);
      });
    });
  });
});

app.get('/manifest/:device', function(req, res) {
  getManifest(req, res);
});

app.get('/manifest', function(req, res) {
  getManifest(req, res);
});

// Request an OAuth Request Token, and redirects the user to authorize it
app.get('/login', function(req, res) {
  doLogin(req, res);
});

app.get('/google_verify', function(req, res) {
  // Verify identity assertion
  // NOTE: Passing just the URL is also possible
  relyingParty.verifyAssertion(req, function(error, result)
  {
    // Result contains properties:
    // - authenticated (true/false)
    // - error (message, only if not authenticated)
    // - answers from any extensions (e.g. 
    //   "http://axschema.org/contact/email" if requested 
    //   and present at provider)
    if (!error && result.authenticated) {
      var c = new cookies( req, res, cookieKeys );
      var email = result.email.toLowerCase();
      mysql.query("select id from developer where email = ?", [email], function(err, results, fields) {
        if (results.length == 0) {
          mysql.query('insert into developer (name, developerId, email, summary) values (?, ?, ?, ?)', [email, email, email, email], function (err, results, fields) {
            c.set("email", email, {signed: true});
            c.set("id", results.insertId, {signed: true});
            res.redirect('/developer');
          });
        }
        else {
          c.set("email", email, {signed: true});
          c.set("id", results[0].id, {signed: true});
          res.redirect('/developer');
        }
      });
    }
    else {
      res.send('bad auth');
    }
  });
});

returnNoRoms = function(res) {
  res.send( { "result": [] });
}

app.get('/', function(req, res) {
  res.redirect('/developer');
});

app.get('/logout', function(req, res){
  var c = new cookies( req, res, cookieKeys );
  email = c.set('email', null, {signed: true});
  email = c.set('id', null, {signed: true});
  res.render('login.jade');
});

function getDistributionUrl(req, relativeFilename) {
  return "http://" + req.headers.host + "/downloads/" + relativeFilename;
}

app.get('/immediate/*', function(req, res) {
  res.sendfile(path.join(process.env.DEPLOYFU_S3FS_PRIVATE_DIR == null ? 'public/downloads' : process.env.DEPLOYFU_S3FS_PRIVATE_DIR, req.params[0]), function(err) {
    console.log(err);
  })
});

if (process.env.DEPLOYFU_S3FS_PRIVATE_DIR != null) {
  app.get('/downloads/*', function(req, res) {
    res.redirect(sprintf("http://romshare.clockworkmod.com/" + req.params[0]));
  });
}

function showDeveloperSettings(req, res, developerId, status, error) {
  mysql.query("select * from developer where id = ?", [developerId], function(err, results, fields) {
    if (results.length == 0) {
      console.log('no results');
      res.redirect('/logout');
    }
    else {
      developer = results[0];
      developer.iconUrl = "http://"  + req.headers.host + '/immediate/' + path.join(developerId, developer.icon);//getDistributionUrl(req, path.join(developerId, developer.icon));
      res.render('settings.jade', { developer: results[0], statusLine: status, errorLine: error });
    }
  });
}

app.get('/developer/settings', function(req, res) {
  if (!isLoggedIn(req, res)) {
    res.redirect('/logout');
    return;
  }
  var c = new cookies( req, res, cookieKeys );
  var developerId = c.get('id', {signed: true});

  showDeveloperSettings(req, res, developerId, null, null);
});

var developerRequiredProperties = ['name', 'developerId', 'summary'];

app.post('/developer/settings', function(req, res, next) {
  var c = new cookies( req, res, cookieKeys );
  var developerId = c.get('id', {signed: true});
  var email = c.get('email', {signed: true});
  if (email == null || developerId == null) {
    req.connection.destroy();
    return;
  }
  var developer = { manifest: null };
  req.form.on('field', function(name, value) {
    if (value != '' && value != null && value != 'None') {
      developer[name] = value;
    }
  });

  verifyRequiredProperties = function() {
    for (var prop in developerRequiredProperties) {
      prop = developerRequiredProperties[prop];
      if (developer[prop] == null) {
        console.log('missing ' + prop);
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
        delete developer.id;
        delete developer.email;
        var columns = [];
        var actualValues = [];
        for (var column in developer) {
          columns.push(column + "=?");
          actualValues.push(developer[column]);
        }
        columns = columns.join(',');
        actualValues.push(developerId);
        var sqlString = sprintf("update developer set %s where id=?", columns);

        var manifestCheck = function() {
          if (!developer.manifest) {
            showDeveloperSettings(req, res, developerId, "Updated Successfully!");
            return;
          }
          ajax("http://jsonp.deployfu.com/clean/" + encodeURIComponent(developer.manifest), function(e, data){
            var errMsg = e ? e : (data.error ? data.error : null);

            if(errMsg)
                showDeveloperSettings(req, res, developerId, "Updated Successfully!", "Warning: Error in manual manifest: " + errMsg);
            else
              showDeveloperSettings(req, res, developerId, "Updated Successfully!");
          });
        };

        mysql.query(sqlString, actualValues, function(err, results, fields) {
          if (err) {
            console.log(err);
          }
          if (files.icon) {
            var prefix = process.env.DEPLOYFU_S3FS_PRIVATE_DIR == null ? path.join(process.env.PWD, 'public/downloads') : process.env.DEPLOYFU_S3FS_PRIVATE_DIR;
            var filename = path.join(prefix, developerId, developer.icon);
            mkdirP(path.dirname(filename), 0700, function(err) {
              var is = fs.createReadStream(files.icon.path);
              var os = fs.createWriteStream(filename);

              util.pump(is, os, function(err) {
                fs.unlinkSync(files.icon.path);
                manifestCheck();
              });
            });
          }
          else {
            manifestCheck();
          }
        });
        
      }
      catch (ex) {
        console.log(ex);
        res.send(ex);
      }
    }
  });
  
  req.form.on('error', function(err){
    if (verifyRequiredProperties())
      req.resume();
  });
  
  // Adjust where the file is saved.
  req.form.on('fileBegin', function(name, file) {
    developer.icon = path.basename(file.path);
    if (!verifyRequiredProperties()) {
      req.connection.destroy();
      res.send('missing required properties');
      //console.log('missing required properties of ' + requiredProperties);
      return;
    }
    var prefix = process.env.DEPLOYFU_SESSION_HOME == null ? path.join(process.env.PWD, 'public/downloads') : process.env.DEPLOYFU_SESSION_HOME;
    file.path = path.join(prefix, path.basename(file.path));
  });
});


app.get('/developer', function(req, res) {
  if (!isLoggedIn(req, res)) {
    console.log("not logged in");
    res.redirect('/logout');
    return;
  }
  var c = new cookies( req, res, cookieKeys );
  var developerId = c.get('id', {signed: true});
  mysql.query('select * from developer where id=?', [developerId],
  function(err, devResults, devFields) {
    if (devResults.length == 0) {
      console.log("no results");
      res.redirect('/logout');
    }
    else {
      mysql.query('select * from rom where developerId=? order by id desc', [developerId],
        function(err, results, fields) {
          for (result in results) {
            var rom = results[result];
            rom.downloadUrl = getDistributionUrl(req, path.join(rom.developerId.toString(), rom.id.toString(), rom.filename));
          }
          res.render('developer.jade', { roms: results, developerName: devResults[0].name });
        });
    }
  });
});

function showRom(req, res, developerId, romId, status) {
  mysql.query('select rom.*, developer.developerId as developerIdString from rom, developer where rom.developerId = ? and rom.id = ? and rom.developerId = developer.id', [developerId, romId], 
    function (err, results, fields) {
      if (err) {
        res.send(err);
        return;
      }
      if (results.length > 0) {
        var rom = results[0];
        rom.downloadUrl = getDistributionUrl(req, path.join(rom.developerId.toString(), rom.id.toString(), rom.filename));
        res.render('rom.jade', { rom: rom, statusLine: status });
      }
      else {
        res.send(sprintf("rom not found: %s %s", developerId, romId));
      }
    });
}

app.get('/developer/rom/:id', function(req, res) {
  if (!isLoggedIn(req, res)) {
    res.redirect('/logout');
    return;
  }
  var c = new cookies( req, res, cookieKeys );
  var developerId = c.get('id', {signed: true});
  showRom(req, res, developerId, req.params.id, false);
});

/*
app.get('/developer/rom/:id/delete', function(req, res) {
  if (!isLoggedIn(req, res)) {
    res.redirect('/logout');
    return;
  }
  var c = new cookies( req, res, cookieKeys );
  var developerId = c.get('id', {signed: true});
  var romId = req.params.id;
  mysql.query('delete from rom where developerId = ? and id = ?', [developerId, romId], 
    function (err, results, fields) {
      res.redirect('/developer');
    });
});
*/

var requiredProperties = ['name', 'device', 'summary'];

function showScreenshots(req, res, developerId, romId) {
  mysql.query('select * from screenshot where developerId=? and romId=?', [developerId, romId],
    function (err, results, fields) {
      if (err) {
        res.send(err);
        return;
      }
      for (var screenshot in results) {
        screenshot = results[screenshot];
        screenshot.url = "http://"  + req.headers.host + '/immediate/' + path.join(developerId, romId, screenshot.filename);//getDistributionUrl(req, path.join(developerId, developer.icon));

      }
      res.render('screenshot.jade', { screenshots: results, romId: romId });
    });
}

app.get('/developer/rom/:id/screenshot', function(req, res) {
  var c = new cookies( req, res, cookieKeys );
  var developerId = c.get('id', {signed: true});
  var romId = req.params.id;
  showScreenshots(req, res, developerId, romId);
});


app.post('/developer/rom/:id/screenshot', function(req, res) {
  var c = new cookies( req, res, cookieKeys );
  var developerId = c.get('id', {signed: true});
  var email = c.get('email', {signed: true});
  if (email == null || developerId == null) {
    req.connection.destroy();
    return;
  }
  var romId = req.params.id;
  
  var screenshotFile = null;
  // Adjust where the file is saved.
  req.form.on('fileBegin', function(name, file) {
    screenshotFile = path.basename(file.path);
    var prefix = process.env.DEPLOYFU_SESSION_HOME == null ? path.join(process.env.PWD, 'public/downloads') : process.env.DEPLOYFU_SESSION_HOME;
    file.path = path.join(prefix, screenshotFile);
  });

  req.form.complete(function(err, fields, files){
    formFiles = files;
    mysql.query("insert into screenshot (filename, developerId, romId) values (?, ?, ?)", [screenshotFile, developerId, romId], function(err, results, fields) {
      if (err) {
        res.send(err);
        return;
      }
      var prefix = process.env.DEPLOYFU_S3FS_PRIVATE_DIR == null ? path.join(process.env.PWD, 'public/downloads') : process.env.DEPLOYFU_S3FS_PRIVATE_DIR;
      var filename = path.join(prefix, developerId, romId, screenshotFile);
      mkdirP(path.dirname(filename), 0700, function(err) {
        var is = fs.createReadStream(files.screenshot.path);
        var os = fs.createWriteStream(filename);

        util.pump(is, os, function(err) {
          fs.unlinkSync(files.screenshot.path);
          showScreenshots(req, res, developerId, romId);
        });
      });
    });
  });
});

app.post('/developer/rom/:id', function(req, res) {
  if (!isLoggedIn(req, res)) {
    res.redirect('/logout');
    return;
  }
  var rom = req.body;
  delete rom.id;
  delete rom.developerId;

  var c = new cookies( req, res, cookieKeys );
  var developerId = c.get('id', {signed: true});
  var romId = req.params.id;
  var columns = [];
  var actualValues = [];
  for (var column in rom) {
    columns.push(column + "=?");
    actualValues.push(rom[column]);
  }
  columns = columns.join(',');
  actualValues.push(developerId);
  actualValues.push(romId);
  var sqlString = sprintf("update rom set %s where developerId=? and id=?", columns);
  mysql.query(sqlString, actualValues,
    function(err, results, fields) {
      showRom(req, res, developerId, req.params.id, "Updated successfully!");
    });
});

app.get('/developer/upload', function(req, res){
  if (!isLoggedIn(req, res)) {
    res.redirect('/logout');
    return;
  }
  ajax("http://gh-pages.clockworkmod.com/ROMManagerManifest/devices.js",
    function(error, data) {
      var devices = data.devices;
      var options = "";
      options += sprintf('<option value="%s">%s</option>', 'None', 'None');
      for (var device in devices) {
        device = devices[device];
        options += sprintf('<option value="%s">%s</option>', device.key, device.name)
      }
      res.render('rom.jade', { devices: devices, rom: {}, statusLine: null });
  });
});

function mkdirP (p, mode, f) {
    var cb = f || function () {};
    if (p.charAt(0) != '/') { cb('Relative path: ' + p); return }
    
    var ps = path.normalize(p).split('/');
    path.exists(p, function (exists) {
        if (exists) cb(null);
        else mkdirP(ps.slice(0,-1).join('/'), mode, function (err) {
            if (err && err.errno != process.EEXIST) cb(err)
            else fs.mkdir(p, mode, cb);
        });
    });
};

app.post('/developer/upload', function(req, res, next) {
  var c = new cookies( req, res, cookieKeys );
  var developerId = c.get('id', {signed: true});
  var email = c.get('email', {signed: true});
  if (email == null || developerId == null) {
    req.connection.destroy();
    return;
  }
  var rom = {};
  req.form.on('field', function(name, value) {
    if (value != '' && value != null && value != 'None') {
      rom[name] = value;
    }
  });

  verifyRequiredProperties = function() {
    for (var prop in requiredProperties) {
      prop = requiredProperties[prop];
      if (rom[prop] == null) {
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

        exec(process.env.PWD + "/scripts/validate_zip.sh " + files.rom.path, function (error, stdout, stderr) {
          if (error) {
            delete rom.filename;
            res.render('rom.jade', { rom: rom, statusLine: "The provided zip file is invalid." });
            return;
          }

          delete rom.id;
          rom.developerId = developerId;
          var props = stdout.split('\n');
          if (props.length >= 2) {
            if (props[0] != "")
              rom.modversion = props[0];
            if (props[1] != "")
              rom.developerIdProp = props[1];
          }
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
          //console.log(files);
          mysql.query(sqlString, actualValues, function(err, results, fields) {
            var prefix = process.env.DEPLOYFU_S3FS_PRIVATE_DIR == null ? path.join(process.env.PWD, 'public/downloads') : process.env.DEPLOYFU_S3FS_PRIVATE_DIR;
            var filename = path.join(prefix, developerId, results.insertId.toString(), rom.filename);

            mkdirP(path.dirname(filename), 0700, function(err) {
              var is = fs.createReadStream(files.rom.path);
              var os = fs.createWriteStream(filename, { mode: 0600 });

              util.pump(is, os, function(err) {
                fs.unlinkSync(files.rom.path);
                showRom(req, res, developerId, results.insertId, "Congratulations! You have uploaded your update.zip!\nIf this is your first upload, the approval process to add your developer section to ROM Manager may take a few hours.")
              });
            });
          });
        });
      }
      catch (ex) {
        console.log(ex);
        res.send(ex);
      }
    }
  });
  
  req.form.on('error', function(err){
    if (verifyRequiredProperties())
      req.resume();
  });
  
  // Adjust where the file is saved.
  req.form.on('fileBegin', function(name, file) {
    rom.filename = path.basename(file.name);
    if (!verifyRequiredProperties()) {
      req.connection.destroy();
      res.send('missing required properties');
      //console.log('missing required properties of ' + requiredProperties);
      return;
    }
    var prefix = process.env.DEPLOYFU_SESSION_HOME == null ? path.join(process.env.PWD, 'public/downloads') : process.env.DEPLOYFU_SESSION_HOME;
    file.path = path.join(prefix, path.basename(file.path));
  });
});

var listenPort = process.env.PORT == null ? 3000 : parseInt(process.env.PORT);
app.listen(listenPort);
console.log('Express app started on port ' + listenPort);

