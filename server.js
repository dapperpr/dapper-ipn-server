var express = require( 'express' );

var ipn_server = process.env.IPN_SERVER_HOST || 'ipn.dapperpr.com';

var app = express()
  // DapperPR's IPN server to receive PayPal notifications
  .use( express.vhost( ipn_server, require( './ipn/app.js' ).app ) )

  // listen on port 80
  .listen( process.env.PORT || 8000 )
;

