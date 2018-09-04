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
define(['zimArchive', 'jquery', 'abstractFilesystemAccess', 'cookies', 'library'], function(zimArchive, $, abstractFilesystemAccess, cookies, library) {

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
            // this return reqd?
            return new zimArchive.ZIMArchive(files, null, callback);            
        }
    };    

    // Allows for shortcuts or full filename of ZIM in URL
    function loadArchiveFromURL(urlArchiveParam){
        var psuedoArchive = library.knownArchives[urlArchiveParam];
        var archiveToLoad = psuedoArchive ? psuedoArchive : '{"_file":{"_files":[{"name":"undefined"}]}}';
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
    };
});
