var fs = require( 'fs' );
var express = require( 'express' );
var email = require( 'emailjs' );
var doT = require( 'dot' );
var redis = require( 'redis' );
var app = express();
var db = redis.createClient(
  process.env.REDIS_PORT || 6379,
  process.env.REDIS_HOST || 'localhost'
);

// some redis error logging:
db.on( "error", function ( err ) {
  log( "Redis error: " + err.toString() );
});

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
      + pad( dt.getHours(), 2 ) + pad( dt.getMinutes(), 2 ) + pad( dt.getSeconds(), 2 )
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
      name: ipn.first_name,
      qty: ipn.quantity,
      time: ipn.item_name
    });

    server.send({
      to: ipn.payer_email,
      from: 'Dreams of Darkness Haunted House <' + emailSettings.user + '>',
      subject: 'Dreams of Darkness Tickets',
      attachment: [
        {
          alternative: true,
          data: msg
        }
      ]
    }, cb );
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

  db.rpush( 'ipn_tx', ipn.txn_type + ',' + ipn.txn_id + ',' + ipn.custom );

  if ( ipn.txn_type === "web_accept" ) {
    if ( ipn.test_ipn && ipn.test_ipn === 1 ) {
      log( "This is a test record: " + ipn.txn_id );
      db.sadd( 'web_accept_tests', ipn.txn_id );
    } else {
      db.sadd( 'web_accept_orders', ipn.txn_id );
    }

    db.hmset( 'web_accept_order:'+ipn.txn_id, {
      "txn_id": ipn.txn_id, 
      "uuid": ipn.custom || "N",
      "redeemed": "N", 
      "qty": ipn.quantity,
      "type": ipn.item_name,
      "fname": ipn.first_name,
      "lname": ipn.last_name,
      "test": ( ipn.text_ipn ? "Y" : "N" )
    });

    // send the qr code/ticket email
    sendEmail( ipn, function ( err, msg ) {
      if ( err ) {
        log( "Error sending email for " + ipn.txn_id + ": " + err.toString() + ": " + err.smtp );
      } else {
        log( "Sent QR to " + ipn.payer_email + " (" + ipn.custom + ") for " + ipn.txn_id );
      }
    });

    // TODO: record in DB
  }

  // TODO: handle errors
  res.send( "Success" );
});

exports.app = app;

