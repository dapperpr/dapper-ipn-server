var fs = require( 'fs' );
var express = require( 'express' );
var ejs = require( 'ejs' );
var email = require( 'emailjs' );
var doT = require( 'dot' );
var redis = require( 'redis' );
var passport = require( 'passport' );
var LocalStrategy = require( 'passport-local' ).Strategy;

var ipn_server = process.env.IPN_SERVER_HOST || 'ipn.dapperpr.com';
var app = express();


/**
 * Connect to the DB
 */
var db = redis.createClient(
  process.env.REDIS_PORT || 6379,
  process.env.REDIS_HOST || 'localhost'
);

// some redis error logging:
db.on( "error", function ( err ) {
  log( "Redis error: " + err.toString() );
});


/**
 * ExpressJS configuration
 */

app.configure(function () {
  app.use(express.logger());
  app.use(express.cookieParser());

  // configure termplate processing
  app.set( 'views', __dirname + '/tpl');
  app.engine('.html', ejs.__express);
  app.set( 'view engine', 'html' );

  // translate request bodies to JSON
  app.use( express.json() );
  app.use( express.urlencoded() );

  // use passport
  app.use( express.session( { secret: 'darkness is coming' } ) );
  app.use( passport.initialize() );
  app.use( passport.session() );
});

// authentication configuration
passport.use( new LocalStrategy( function ( username, password, done ) {
  db.get( 'auth:user:' + username, function ( err, reply ) {
    if ( ! err ) {
      if ( ! reply || password !== reply ) {
        return done( null, false, { message: 'Invalid username or password.' } );
      } else {
        return done( null, { username: username } );
      }
    } else {
      return done( null, false, { message: 'Internal error.' } );
    }
  })
}));

// Passport session setup.
passport.serializeUser( function( user, done ) {
  done( null, user.username );
});

passport.deserializeUser( function( username, done ) {
  done( null, { username: username } );
});

// Simple route middleware to ensure user is authenticated.
//   Use this route middleware on any resource that needs to be protected.  If
//   the request is authenticated (typically via a persistent login session),
//   the request will proceed.  Otherwise, the user will be redirected to the
//   login page.
function ensureAuthenticated(req, res, next) {
  if ( req.isAuthenticated() ) { return next(); }
  res.redirect( '/dod/login' );
}


/**
 * Helper functions
 */

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


/**
 * Email
 */

// Helping for getting the email template if we need to
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
      url: encodeURIComponent( 'http://' + ipn_server + '/dod/verify/' + ipn.txn_id ),
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

app.get( '/dod/login', function ( req, res ) {
  res.render( 'login' );
});

app.post( '/dod/login', passport.authenticate( 'local' ), function ( req, res ) {
  if ( req.user ) {
    res.send( "success" );
  } else {
    res.send( 403, "Invalid username or password." );
  }
});

app.get( '/dod/logout', function ( req, res ){
  req.logout();
  res.redirect( '/dod/login' );
});

app.get( '/dod/verify', ensureAuthenticated, function ( req, res ) {
  res.render( 'verify' );
});

app.get( '/dod/verify/:id', ensureAuthenticated, function ( req, res ) {
  res.redirect( '/dod/verify#/' + req.params.id );
});

app.get( '/dod/get/:id', ensureAuthenticated, function ( req, res ) {
  db.hgetall( 'web_accept_order:' + req.params.id, function ( err, order ) {
    if ( err ) {
      res.send( 500, "Internal error." );
    } else if ( ! order ) {
      res.send( 404, "Not found." );
    } else {
      res.json( order );
    }
  });
});

app.post( '/dod/redeem/:id', ensureAuthenticated, function ( req, res ) {
  var dt = new Date();
  var dts = "" 
    + dt.getFullYear() + "-" + pad( dt.getMonth() + 1, 2 )
    + "-" + pad( dt.getDate(), 2 )
    + " " + pad( dt.getHours(), 2 ) + pad( dt.getMinutes(), 2 );

  db.hmset( 'web_accept_order:' + req.params.id, {
    redeemed: 'Y',
    redeemed_at: dts
  });

  db.hgetall( 'web_accept_order:' + req.params.id, function ( err, order ) {
    if ( err ) {
      res.send( 500, "Internal error." );
    } else if ( ! order ) {
      res.send( 404, "Not found." );
    } else {
      res.json( order );
    }
  });
});

app.post( '/dod', function ( req, res ) {
  var ipn = req.body;
  log( "Received " + ipn.txn_type + " IPN: "
    + ipn.payer_email 
    + ", TXN_ID: " + ipn.txn_id 
    + ", UUID: " + ( ipn.custom || 'n/a' ) );

  db.rpush( 'ipn_tx', ipn.txn_type + ',' + ipn.txn_id + ',' + ipn.custom );

  if ( ipn.txn_type === "web_accept" ) {
    db.sadd( 'web_accept_orders', ipn.txn_id );
    db.hmset( 'web_accept_order:'+ipn.txn_id, {
      "txn_id": ipn.txn_id, 
      "uuid": ipn.custom || "N",
      "redeemed": "N", 
      "qty": ipn.quantity,
      "type": ipn.item_name,
      "fname": ipn.first_name,
      "lname": ipn.last_name,
      "dt": ipn.payment_date
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

