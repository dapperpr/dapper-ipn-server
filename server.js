var express = require( 'express' );

var app = express()
  // DapperPR's IPN server to receive PayPal notifications
  .use( express.vhost( 'ipn.dapperpr.com', require( './ipn/app.js' ).app ) )

  // listen on port 80
  .listen( process.env.PORT || 8000 )
;

