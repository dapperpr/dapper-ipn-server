var express = require( 'express' );
var app = express();

app.get( '/', function ( req, res ) {
  res.send( "Access denied.", 403 );
});

app.post( '/dod', function ( req, res ) {
});

exports.app = app;

