/**
 * zimArchive.js: Support for archives in ZIM format.
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
define(['zimfile', 'zimDirEntry', 'util', 'utf8'],
    function(zimfile, zimDirEntry, util, utf8) {
    
    /**
     * ZIM Archive
     * 
     * 
     * @typedef ZIMArchive
     * @property {ZIMFile} _file The ZIM file (instance of ZIMFile, that might physically be splitted into several actual files)
     * @property {String} _language Language of the content
     */
    ZIMArchive.prototype = {
        _file:null,
        _language:""
    }    
    
    /**
     * @callback callbackZIMArchive
     * @param {ZIMArchive} zimArchive Ready-to-use ZIMArchive
     */
    
    
    /**
     * Creates a ZIM archive object to access the ZIM file at the given path in the given storage.
     * This constructor can also be used with a single File parameter.
     * 
     * @param {StorageFirefoxOS|Array.<Blob>} storage Storage (in this case, the path must be given) or Array of Files (path parameter must be omitted)
     * @param {String} path
     * @param {callbackZIMArchive} callbackReady
     */
    function ZIMArchive(storage, path, callbackReady) {
        var that = this;
        that._file = null;
        that._language = ""; //@TODO
        // required to support creation from string using set()
        if (!storage && !path && !callbackReady)
            return;

        var createZimfile = function(fileArray) {
            zimfile.fromFileArray(fileArray).then(function(file) {
                that._file = file;
                callbackReady(that);
            });
        };
        if (storage && !path) {
            var fileList = storage;
            // We need to convert the FileList into an Array
            var fileArray = [].slice.call(fileList);
            // The constructor has been called with an array of File/Blob parameter
            createZimfile(fileArray);
        }
        else {
            if (/.*zim..$/.test(path)) {
                // splitted archive
                that._searchArchiveParts(storage, path.slice(0, -2)).then(function(fileArray) {
                    createZimfile(fileArray);
                }, function(error) {
                    alert("Error reading files in splitted archive " + path + ": " + error);
                });
            }
            else {
                storage.get(path).then(function(file) {
                    createZimfile([file]);
                }, function(error) {
                    alert("Error reading ZIM file " + path + " : " + error);
                });
            }
        }
    };

    /* As js doesn't have constructor overloading and a 3 arg constructor is already exposed
       Eg: new zimArchive.ZIMArchive().set(fromString) creates the object from a String  
    */
    ZIMArchive.prototype.set = function(fromString){
        this._file = zimfile.create(fromString);
        return this;
    }

    /**
     * Searches the directory for all parts of a splitted archive.
     * @param {Storage} storage storage interface
     * @param {String} prefixPath path to the splitted files, missing the "aa" / "ab" / ... suffix.
     * @returns {Promise} that resolves to the array of file objects found.
     */
    ZIMArchive.prototype._searchArchiveParts = function(storage, prefixPath) {
        var fileArray = [];
        var nextFile = function(part) {
            var suffix = String.fromCharCode(0x61 + Math.floor(part / 26)) + String.fromCharCode(0x61 + part % 26);
            return storage.get(prefixPath + suffix)
                .then(function(file) {
                    fileArray.push(file);
                    return nextFile(part + 1);
                }, function(error) {
                    return fileArray;
                });
        };
        return nextFile(0);
    };

    /**
     * 
     * @returns {Boolean}
     */
    ZIMArchive.prototype.isReady = function() {
        return this._file !== null;
    };
    
    /**
     * Looks for the DirEntry of the main page
     * @param {callbackDirEntry} callback
     * @returns {Promise} that resolves to the DirEntry
     */
    ZIMArchive.prototype.getMainPageDirEntry = function(callback) {
        if (this.isReady()) {
            var mainPageUrlIndex = this._file.mainPage;
            this._file.dirEntryByUrlIndex(mainPageUrlIndex).then(callback);
        }
    };

    /**
     * 
     * @param {String} dirEntryId
     * @returns {DirEntry}
     */
    ZIMArchive.prototype.parseDirEntryId = function(dirEntryId) {
        return zimDirEntry.DirEntry.fromStringId(this._file, dirEntryId);
    };
    
    /**
     * 
     * @param {DirEntry} dirEntry
     * @param {callbackDirEntry} callback
     */
    ZIMArchive.prototype.resolveRedirect = function(dirEntry, callback) {
        this._file.dirEntryByUrlIndex(dirEntry.redirectTarget).then(callback);
    };
        
    /**
     * 
     * @param {DirEntry} dirEntry
     * @param {callbackStringContent} callback
     */
    ZIMArchive.prototype.readArticle = function(dirEntry, callback) {
        dirEntry.readData().then(function(data) {
            callback(dirEntry.title, utf8.parse(data));
        });
    };

    /**
     * Read a binary file.
     * @param {DirEntry} dirEntry
     * @param {callbackBinaryContent} callback is called with data as only argument
     */
    ZIMArchive.prototype.readBinaryFile = function(dirEntry, callback) {
        return dirEntry.readData().then(callback);
    };
    
    var regexpTitleWithoutNameSpace = /^[^\/]+$/;

    /**
     * Searches a DirEntry (article / page) by its url eg: Paris.html
     * @param {String} article url
     * @return {Promise} resolving to the DirEntry object or null if not found.
     */
    ZIMArchive.prototype.getDirEntryByURL = function(url, cache) {
        var that = this;
        // [BUG] Spec ambiguity - stackoverflow has articles titled tag/blah, question/blah etc
        // This function should just return a DirEntry whatever the url unless some url scheme is mentioned in the ZIM spec  
        // //If no namespace is mentioned, it's an article, and we have to add it
        // // if (regexpTitleWithoutNameSpace.test(url)) {
        // //   url= "A/" + url;
        // // }
        if (cache && cache.has(url)){
            //console.log("cache hit");
            return Promise.resolve().then(() => cache.get(url));
        }
        return util.binarySearch(0, this._file.articleCount, function(i) {
            return that._file.dirEntryByUrlIndex(i, cache).then(function(dirEntry) {
                var foundurl = dirEntry.namespace + "/" + dirEntry.url;
                if (url < foundurl)
                    return -1;
                else if (url > foundurl)
                    return 1;
                else
                    return 0;
            });
        }).then(function(index) {
            if (index === null) return null;
            return that._file.dirEntryByUrlIndex(index);
        }).then(function(dirEntry) {
            if(cache)
                cache.set(url, dirEntry);
            return dirEntry;
        });
    };

    /**
     * 
     * @param {callbackDirEntry} callback
     */
    ZIMArchive.prototype.getRandomDirEntry = function(callback) {
        var index = Math.floor(Math.random() * this._file.articleCount);
        this._file.dirEntryByUrlIndex(index).then(callback);
    };

    /**
     * Functions and classes exposed by this module
     */
    return {
        ZIMArchive: ZIMArchive
    };
});
