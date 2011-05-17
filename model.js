sprintf = require('sprintf').sprintf;
mysql = require('./mysql').mysql;
setting = require('./setting');

setting.get('model_version', function(version) {
  if (version == null) {
    mysql.query('create table if not exists settings (name varchar(32) primary key not null, value varchar(256))');

    mysql.query('create table if not exists developer (id int primary key not null auto_increment, name varchar(32), developerId varchar(32), email varchar(32), icon varchar(256), summary varchar(256))');
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
    version = "1";
  }
  
  if (version == "1") {
    mysql.query('alter table rom add column (visible boolean default true)')
    version = "2";
  }

  setting.set('model_version', version);
});

exports.mysql = mysql;