var fs = require( 'fs' );
var express = require( 'express' );
//var redis = require( 'redis' );
var app = express();
/*var db = redis.createClient(
  6379,
  process.env.REDIS_HOST || 'localhost'
);*/ 

// translate request bodies to JSON
app.use( express.json() );
app.use( express.urlencoded() );

// Get the email template if we need to
var emailTemplate;
function withTemplate ( cb ) {
  if ( emailTemplate ) {
    cb( emailTemplate );
  } else {
    fs.readFile( __dirname + '/tpl/email.tpl.html', 'utf8', function ( err, data ) {
      emailTemplate = doT.template( data );
      cb( emailTemplate );
    });
  }
}

// Just pads a number
// http://stackoverflow.com/a/10073764/259038
function pad ( n, width, z ) {
  z = z || '0';
  n = n + '';
  return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
}

// convenience message for logging
function log ( msg ) {
  var dt = new Date();
  console.log( '[dod]['
      + dt.getFullYear() + "" + pad( dt.getMonth() + 1, 2 ) + "" + pad( dt.getDate(), 2 )
      + '] ' 
      + msg 
  );
}

// Email configuration
var emailSettings = {
  host: 'mail.dreamsofdarkness.com',
  ssl: true,
  port: 465,
  user: 'info@dreamsofdarkness.com',
  password: process.env.EMAIL_PWD
};

function sendEmail ( ipn, cb ) {
  var server = email.server.connect( emailSettings );
  var msg;

  withTemplate( function ( tpl ) {
    msg = emailTemplate({
      url: encodeURIComponent( 'http://ipn.dapperpr.com/dod/verify/' + ipn.txn_id ),
      name: ipn.first_name
    });

    server.send({
      to: ipn.payer_email,
      from: emailSettings.user,
      subject: 'Dreams of Darkness Tickets',
      attachment: [
        {
          inline: true,
          data: 'html',
          type: 'text/html'
        }
      ]
    }, function ( err, msg ) {
      if ( err ) {
        log( "Error sending email for " + ipn.txn_id + ": " + err.toString() );
      } else {
        log( "Sent QR to " + ipn.payer_email + " for " + ipn.txn_id );
      }

      cb && cb();
    });
  });
}

/**
 * Routes
 */

app.get( '/', function ( req, res ) {
  res.send( "Not intended to be accessed manually." );
});

app.post( '/dod', function ( req, res ) {
  var ipn = req.body;
  log( "Received " + ipn.txn_type + " IPN: "
    + ipn.payer_email 
    + ", TXN_ID: " + ipn.txn_id 
    + ", UUID: " + ( ipn.custom || 'n/a' ) );

  if ( ipn.txn_type === "web_accept" ) {
    sendEmail( ipn );
    // TODO: record in DB
  }
});

exports.app = app;

