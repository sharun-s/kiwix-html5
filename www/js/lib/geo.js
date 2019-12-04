'use strict';
define(['jquery'], function($) {

    function _find( options ) {
        return new Promise((resolve, reject)=>{
            function pagesSuccess( pages ) {
                options.pages = pages;
                if ( pages && pages.length === 0 ) {
                    options.errorOptions = _errorOptions( 'empty' );
                }
                _isLoading = false;
                resolve( options );
            }

            function pagesError( code ) {
                _isLoading = false;
                options.errorOptions = _errorOptions( code );
                resolve( options );
            }
            if ( options.latitude && options.longitude ) {
                getPages(
                {
                    latitude: options.latitude,
                    longitude: options.longitude
                },
                range).then( pagesSuccess, pagesError );
            } else if ( options.pageTitle ) {
                getPagesAroundPage( options.pageTitle, range )
                .then( pagesSuccess, pagesError );
            } else {
                if ( options.errorType ) {
                    options.errorOptions = _errorOptions( options.errorType );
                }
                resolve( options );
            }
        });
    }

    function locAvailable(){
        return 'geolocation' in navigator;
    };


    function _search( params, range, exclude ) {
        var requestParams, d = Promise.resolve();

        /*requestParams = extendSearchParams( 'nearby', {
            colimit: 'max',
            prop: [ 'coordinates' ],
            generator: 'geosearch',
            ggsradius: range,
            ggsnamespace: ns,
            ggslimit: limit,
            formatversion: 2
        }, params );

        if ( params.ggscoord ) {
            requestParams.codistancefrompoint = params.ggscoord;
        } else if ( params.ggspage ) {
            requestParams.codistancefrompage = params.ggspage;
        }*/
        // dummy test request
        requestParams = {
            index:"voyage",
            body:{
                "stored_fields":"title",  
                "query": {
                  "bool" : {
                      "must" : {
                          "match_all" : {}
                      },
                      "filter" : {
                          "geo_distance" : {
                              "distance" : "100km",
                              "coordinates.coord" : {
                                  "lon" : 80.270001,
                                  "lat" : 13.083889
                                }
                            }
                        }
                    }
                }
            }
        }
        client.search(requestParams).then( function ( resp ) {
            console.log(resp);
            var pages;
            // resp.query.pages is an Array<Page> instead of a map like in other
            // API requests
            if ( resp.query ) {
                pages = resp.query.pages || [];
            } else {
                pages = [];
            }

            pages = pages.map( function ( page, i ) {
                var coords, p;
                p = Page.newFromJSON( page );
                p.anchor = 'item_' + i;

                if ( page.coordinates ) { // FIXME: protect against bug T49133 (remove when resolved)
                    coords = page.coordinates[0];
                    // FIXME: Make part of the Page object
                    p.dist = coords.dist / 1000;
                    p.latitude = coords.lat;
                    p.longitude = coords.lon;
                    //p.proximity = self._distanceMessage( p.dist );
                } else {
                    p.dist = 0;
                }
                if ( exclude !== page.title ) {
                    return p;
                } else {
                    return null;
                }
            } ).filter( function ( page ) { return !!page; } );

            pages.sort( function ( a, b ) {
                return a.dist > b.dist ? 1 : -1;
            } );
            d.resolve( pages );
        }, function ( error ) {
            d.reject( error );
        } );
        return d;
    };


    function getPages( coords, range, exclude ) {
        return _search( {
            ggscoord: [ coords.latitude, coords.longitude ]
        }, range, exclude );
    };
    function getPagesAroundPage( page, range ) {
        return _search( {
            ggspage: page
        }, range, page );
    };
var _isLoading=false;
var range = 20;

var errorMessages = {
            empty: {
                heading: "Quiet out here... There weren't any pages found with nearby topics.",
                hasHeading: true,
                msg: 'Try increasing the search radius' 
            },
            http: {
                heading: 'Nearby is having some issues.',
                hasHeading: true,
                msg: 'Try refreshing your location' 
            },
            incompatible: {
                heading: "Sorry! Your web browser doesn't support Location based Search",
                hasHeading: true,
                msg: "Try a different browser or enable JavaScript if you've disabled it." 
            }
        };
    function _errorOptions( key ) {
            var message = errorMessages[ key ] || errorMessages.http;
            return message.msg;
            //return $.extend.apply( $,  {
            //    className: 'errorbox'
            //}, message );
        }
    var client;
    function refresh(c, options){
        $( '.page-list' ).addClass( 'hidden' );
        // Run it once for loader etc
        client = c;
        console.log(client);
        var _isLoading = true;
        if ( ( options.latitude && options.longitude ) || options.pageTitle ) {
            // Flush any existing list of pages
            options.pages = [];

            // Get some new pages
            return _find( options ).then( function ( options ) {
                //_super.call( self, options );
                console.log(options);
            }, function ( errorType ) {
                options.errorOptions = _errorOptions( errorType );
                _isLoading = false;
                //_super.call( self, options );
                console.log("call refresh "+ options.errorOptions);
            } );
        } else {
            throw new Error( 'No title or longitude, latitude options have been passed' );
        }
    }
    function getCurrentPosition() {
        return new Promise((resolve, reject)=>
        {
            if (locAvailable() ) {
                navigator.geolocation.getCurrentPosition(
                    function ( geo ) {
                        resolve( {
                            latitude: geo.coords.latitude,
                            longitude: geo.coords.longitude
                        } );
                    },
                    function ( err ) {
                        var error;
                        switch ( err.code ) {
                            case err.PERMISSION_DENIED:
                            error = 'permission';
                            break;
                            case err.TIMEOUT:
                            error = 'timeout';
                            break;
                            case err.POSITION_UNAVAILABLE:
                            error = 'location';
                            break;
                            default:
                            error = 'unknown';
                        }
                        reject( error );
                    },
                    {
                        timeout: 10000,
                        enableHighAccuracy: true
                    });
            } else {
                reject( 'incompatible' );
            }
        });
    }
    return {
        getCurrentPosition: getCurrentPosition,
        refresh: refresh
    }

});