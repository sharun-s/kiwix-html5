/**
 * zimArchiveLoader.js: Functions to search and read ZIM archives.
 *
 * Copyright 2015 Mossroy and contributors
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
define(['zimArchive', 'jquery', 'abstractFilesystemAccess', 'cookies'], function(zimArchive, $, abstractFilesystemAccess, cookies) {

    var storages, directories, scanDone;
    // Only required on FFOS can be extended to other platforms
    function storageExists(){
        if ($.isFunction(navigator.getDeviceStorages)) {
            // The method getDeviceStorages is available (FxOS>=1.1)
            storages = $.map(navigator.getDeviceStorages("sdcard"), function(s) {
                return new abstractFilesystemAccess.StorageFirefoxOS(s);
            });
            
            if (storages !== null && storages.length > 0){
                return true;
            }else
                return false;
        }else
            return false;
    }

    function fromLocalStorage(onComplete){
        scanDone = onComplete;
        // Make a fake first access to device storage, in order to ask the user for confirmation if necessary.
        // This way, it is only done once at this moment, instead of being done several times in callbacks
        // After that, we can start looking for archives
        storages[0].get("fake-file-to-read").then(searchForArchivesInPreferencesOrStorage,
                                              searchForArchivesInPreferencesOrStorage);            
    }
    // returns true if list of archives found either from cookie or on scane
    function searchForArchivesInPreferencesOrStorage() {
        // First see if the list of archives is stored in the cookie
        var listOfArchivesFromCookie = cookies.getItem("listOfArchives");
        if (listOfArchivesFromCookie !== null && listOfArchivesFromCookie !== undefined && listOfArchivesFromCookie !== "") {
            directories = listOfArchivesFromCookie.split('|');
            return true;
        }
        else {
            scanForArchives();
        }
    }

    /**
     * Create a ZIMArchive from DeviceStorage location
     * @param {DeviceStorage} storage
     * @param {String} path
     * @param {callbackZIMArchive} callback
     * @returns {ZIMArchive}
     */
    function loadArchiveFromDeviceStorage(storage, path, callback) {
        return new zimArchive.ZIMArchive(storage, path, callback);
    };
    /**
     * Create a ZIMArchive from Files
     * @param {Array.<File>} files
     * @param {callbackZIMArchive} callback
     * @returns {ZIMArchive}
     */
    function loadArchiveFromFiles(files, callback) {
        if (files.length >= 1) {
            return new zimArchive.ZIMArchive(files, null, callback);
        }
    };

    // TODO: Create a map of all known zims that can be loaded
    // Added shortnames so fullfile name doesn't need to be used
    // shortname can be used to point at latest version of a particular archive
    // Should there be a "default" archive?
    var knownArchives = { 
             so: '{"_file":{"_files":[{"name":"stackoverflow.com_eng_all_2017-05.zim","size":55332776056}],"articleCount":70576346,"clusterCount":72703,"urlPtrPos":383,"titlePtrPos":564611151,"clusterPtrPos":5690486065,"mimeListPos":80,"mainPage":21299347,"layoutPage":4294967295},"_language":""}',
           wiki: '{"_file":{"_files":[{"name":"wikipedia_en_all_2016-12.zim","size":62695819637}],"articleCount":17454230,"clusterCount":90296,"urlPtrPos":236,"titlePtrPos":139634076,"clusterPtrPos":1237308322,"mimeListPos":80,"mainPage":4294967295,"layoutPage":4294967295},"_language":""}',
         quotes: '{"_file":{"_files":[{"name":"wikiquote_en_all_nopic_2017-03.zim","size":121026170}],"articleCount":53511,"clusterCount":252,"urlPtrPos":168,"titlePtrPos":428256,"clusterPtrPos":3359985,"mimeListPos":80,"mainPage":30342,"layoutPage":4294967295},"_language":""}',
           dict: '{"_file":{"_files":[{"name":"wiktionary_en_simple_all_nopic_2017-01.zim","size":6001233}],"articleCount":25444,"clusterCount":41,"urlPtrPos":168,"titlePtrPos":203720,"clusterPtrPos":1292216,"mimeListPos":80,"mainPage":12520,"layoutPage":4294967295},"_language":""}',
         voyage: '{"_file":{"_files":[{"name":"wikivoyage_en_all_2017-08.zim","size":731527966}],"articleCount":97674,"clusterCount":581,"urlPtrPos":225,"titlePtrPos":781617,"clusterPtrPos":5992414,"mimeListPos":80,"mainPage":46890,"layoutPage":4294967295},"_language":""}', 
        "stackoverflow.com_eng_all_2017-05.zim": '{"_file":{"_files":[{"name":"stackoverflow.com_eng_all_2017-05.zim","size":55332776056}],"articleCount":70576346,"clusterCount":72703,"urlPtrPos":383,"titlePtrPos":564611151,"clusterPtrPos":5690486065,"mimeListPos":80,"mainPage":21299347,"layoutPage":4294967295},"_language":""}',
        "wikipedia_en_all_2016-12.zim": '{"_file":{"_files":[{"name":"wikipedia_en_all_2016-12.zim","size":62695819637}],"articleCount":17454230,"clusterCount":90296,"urlPtrPos":236,"titlePtrPos":139634076,"clusterPtrPos":1237308322,"mimeListPos":80,"mainPage":4294967295,"layoutPage":4294967295},"_language":""}',
        "wikiquote_en_all_nopic_2017-03.zim": '{"_file":{"_files":[{"name":"wikiquote_en_all_nopic_2017-03.zim","size":121026170}],"articleCount":53511,"clusterCount":252,"urlPtrPos":168,"titlePtrPos":428256,"clusterPtrPos":3359985,"mimeListPos":80,"mainPage":30342,"layoutPage":4294967295},"_language":""}',
        "wiktionary_en_simple_all_nopic_2017-01.zim": '{"_file":{"_files":[{"name":"wiktionary_en_simple_all_nopic_2017-01.zim","size":6001233}],"articleCount":25444,"clusterCount":41,"urlPtrPos":168,"titlePtrPos":203720,"clusterPtrPos":1292216,"mimeListPos":80,"mainPage":12520,"layoutPage":4294967295},"_language":""}',
        "wikivoyage_en_all_2017-08.zim": '{"_file":{"_files":[{"name":"wikivoyage_en_all_2017-08.zim","size":731527966}],"articleCount":97674,"clusterCount":581,"urlPtrPos":225,"titlePtrPos":781617,"clusterPtrPos":5992414,"mimeListPos":80,"mainPage":46890,"layoutPage":4294967295},"_language":""}',
           test: '{"_file":{"_files":[{"name":"../tests/wikipedia_en_ray_charles_2015-06.zim","size":1476042}],"articleCount":458,"clusterCount":215,"urlPtrPos":195,"titlePtrPos":3859,"clusterPtrPos":30811,"mimeListPos":80,"mainPage":238,"layoutPage":4294967295},"_language":""}'         
    };

    var URL2Archive = {
        'simple.wikipedia.org': 'wiki',
        'en.wikipedia.org': 'wiki',
        'en.wikipedia.org/wiki': 'wiki',
        'en.wiktionary.org/wiki': 'dict',
        'stackoverflow.com': 'so',
        'www.stackoverflow.com': 'so',
        'developer.mozilla.com': 'mdn',
        'msdn.com': 'msdn'
    };

    function onDiskMatches(library){
        function filename(obj){ return obj.url.split("/").slice(-1)[0].slice(0,-6); };
        var onDisk = library.filter((i) => knownArchives.hasOwnProperty(filename(i)));
        // Adding just filename without full path. Reqd to be passed to ?archive= during a zim reload.
        onDisk.forEach(function(obj) { obj.filename = filename(obj); });
        return onDisk;
        //onDiskAll = []; 
        //for(i in knownArchives){ if (i === filename(onDiskMatches.url) return i};
    }

    // Allows for shortcuts or full filename of ZIM in URL
    function loadArchiveFromURL(urlArchiveParam){
        var archiveToLoad = knownArchives[urlArchiveParam] ? knownArchives[urlArchiveParam] : '{"_file":{"_files":[{"name":"undefined"}]}}';
        return loadArchiveFromString(archiveToLoad);    
    }            
            
    // @param str - stringified archive obj, should be like output from stringifyArchive() in app.js
    function loadArchiveFromString(str) {
        return new zimArchive.ZIMArchive().set(str);
    };
    
    /**
     * @callback callbackPathList
     * @param {Array.<String>} directoryList List of directories
     */
    
    
    /**
     *  Scans the DeviceStorage for archives
     *
     * @param {callbackPathList} callbackFunction Function to call with the list of directories where archives are found
     */
    function scanForArchives(callbackFunction) {
        directories = [];
        var promises = $.map(storages, function(storage) {
            return storage.scanForArchives()
                .then(function(dirs) {
                    $.merge(directories, dirs);
                    return true;
                });
        });
        $.when.apply(null, promises).then(function() {
            scanDone(directories);
            return true;
        }, function(error) {
            alert("Error scanning your SD card : " + error
                    + ". If you're using the Firefox OS Simulator, please put the archives in "
                    + "a 'fake-sdcard' directory inside your Firefox profile "
                    + "(ex : ~/.mozilla/firefox/xxxx.default/extensions/fxos_2_x_simulator@mozilla.org/"
                    + "profile/fake-sdcard/wikipedia_en_ray_charles_2015-06.zim)");
            scanDone(null);
        });
    };

    /**
     * Functions and classes exposed by this module
     */
    return {
        loadArchiveFromDeviceStorage: loadArchiveFromDeviceStorage,
        loadArchiveFromFiles: loadArchiveFromFiles,
        loadArchiveFromString: loadArchiveFromString,
        loadArchiveFromURL: loadArchiveFromURL,
        storageExists: storageExists,
        findArchives: fromLocalStorage,
        scanForArchives: scanForArchives,
        onDiskMatches: onDiskMatches,
        URL2Archive: URL2Archive
    };
});
