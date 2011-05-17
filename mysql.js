mysql = new require('mysql').Client();

mysql.host = process.env.DEPLOYFU_MYSQL_HOST == null ? 'localhost' : process.env.DEPLOYFU_MYSQL_HOST;
mysql.user = process.env.DEPLOYFU_MYSQL_USER == null ? 'root' : process.env.DEPLOYFU_MYSQL_USER;
mysql.password = process.env.DEPLOYFU_MYSQL_PASSWORD == null ? 'nignog' : process.env.DEPLOYFU_MYSQL_PASSWORD;
mysql.connect(function(err) {
  if (err)
    console.log(err);
});

mysql.query(sprintf('use %s', process.env.DEPLOYFU_MYSQL_DATABASE == null ? 'romshare' : process.env.DEPLOYFU_MYSQL_DATABASE));

exports.mysql = mysql;