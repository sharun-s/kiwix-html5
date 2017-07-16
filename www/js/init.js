/**
 * init.js : Configuration for the library require.js
 * This file handles the dependencies between javascript libraries
 * 
 * Copyright 2013-2014 Mossroy and contributors
 * License GPL v3:
 * 
 * This file is part of Kiwix.
 * 
 * Kiwix is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * Kiwix is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with Kiwix (file LICENSE-GPLv3.txt).  If not, see <http://www.gnu.org/licenses/>
 */
'use strict';
var params={};
location.search.replace(/[?&]+([^=&]+)=([^&]*)/gi,function(s,k,v){params[k]=v});
// using this to test workaround for bugzilla.mozilla.org/show_bug.cgi?id=1378228
var isFirefox = typeof InstallTrigger !== 'undefined';
var mode = params['mode'] || "file";
if (isFirefox && (mode !== "file")) {
    mode = "xhrFF";
};

var results = params['results'] || 10;
require.config({
    baseUrl: 'js/lib',
    config: {'util': { mode: mode},'../app': { mode: mode, results: results, isFirefox:isFirefox}},
    paths: {
        'jquery': 'jquery-2.1.4',
        'bootstrap': 'bootstrap'
    },
    shim: {
        'jquery' : {
            exports : '$'
        },
        'bootstrap': {
            deps: ['jquery']
        }
    }
});

requirejs(['bootstrap', '../app']);