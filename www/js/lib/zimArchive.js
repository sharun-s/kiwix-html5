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
define(['zimfile', 'zimDirEntry', 'util', 'utf8', 'finder'],
    function(zimfile, zimDirEntry, util, utf8, finder) {
    
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
       Eg: new zimArchive.ZIMArchive().create(fromString) creates the object from a String  
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
     * @callback callbackDirEntryList
     * @param {Array.<DirEntry>} dirEntryArray Array of DirEntries found
     */

    /**
     * Look for DirEntries with title starting with the given prefix.
     * For now, ZIM titles are case sensitive.
     * So, as workaround, we try several variants of the prefix to find more results.
     * This should be enhanced when the ZIM format will be modified to store normalized titles
     * See https://phabricator.wikimedia.org/T108536
     * 
     * @param {String} prefix
     * @param {Integer} resultSize
     * @param {callbackDirEntryList} callback
     */
    ZIMArchive.prototype.findDirEntriesWithPrefix = function(prefix, resultSize, callback) {
        var that = this;
        var prefixVariants = util.removeDuplicateStringsInSmallArray([prefix, util.ucFirstLetter(prefix), util.lcFirstLetter(prefix), util.ucEveryFirstLetter(prefix)]);
        var dirEntries = [];
        console.time("search");
        console.log(prefixVariants);
        function searchNextVariant() {
            if (prefixVariants.length === 0 || dirEntries.length >= resultSize) {
                callback(dirEntries);
                console.timeEnd("search");
                return;
            }
            var prefix = prefixVariants[0];
            prefixVariants = prefixVariants.slice(1);
            that.findDirEntriesWithPrefixCaseSensitive(prefix, resultSize - dirEntries.length, function (newDirEntries) {
                dirEntries.push.apply(dirEntries, newDirEntries);
                searchNextVariant();
            });
        }
        searchNextVariant();
    };

    var waitForArticleReadCompletion = null;
    // rewrite of findDirEntriesWithPrefix
    // Callback is called for each Result found. calback args - dirEntry, data
    // Previously it was called after all results were found which slows things down.
    ZIMArchive.prototype.findDirEntriesAndContent = function(prefix, resultSize, callback) {
        var that = this;
        var matchedArticles = [];
        //var dupCache, redirectCache = new Map();
        // The order in which variants are processed can seriosly effect performance
        // Proccessing is done one at a time, when the time to find first match increases, time to first paint increase       
        // So current approach - first variant processed is a exact match of what user typed
        var prefixVariants = util.removeDuplicateStringsInSmallArray([ 
            util.ucFirstLetter(prefix), 
            util.lcFirstLetter(prefix), 
            util.ucEveryFirstLetter(prefix),
            prefix]);
        var articlesWithTitleMatchingKeyword = 0;
        console.time("search");
        console.log(prefixVariants);
        
        // Initiate search for dirent of first variant
        // This callback is called everytime an article with titleis matched  
        function onFoundGetContentUpdateUI(articleDirEntry) {
            if (articleDirEntry){
                articlesWithTitleMatchingKeyword++;
                // This is mainly to save dirents found while a readArticle is happening
                if(waitForArticleReadCompletion){
                    console.log(articleDirEntry.title + " saved for later");
                    matchedArticles.push(articleDirEntry);
                }else{
                    function read(articleDirEntry){
                        console.log(articleDirEntry.title + " reading...");
                        waitForArticleReadCompletion = articleDirEntry.readData();
                        waitForArticleReadCompletion.then(function(data) {
                            // start image loader process for this article
                            console.log(articleDirEntry.title + " read done");
                            callback(articleDirEntry, utf8.parse(data));
                        }).then(function readNext(){
                            var articleDirEntry = matchedArticles.pop();
                            if(articleDirEntry){
                                read(articleDirEntry);    
                            }else{
                                // all articles in matchedArticles have been read
                                waitForArticleReadCompletion = null;
                            }
                        });
                    };
                    read(articleDirEntry);
                }                
            }else{
                //debugger;
                if (prefixVariants.length === 0 || articlesWithTitleMatchingKeyword >= resultSize) {
                    console.log("Matched Articles Found Across Variants:" + articlesWithTitleMatchingKeyword);
                    console.timeEnd("search");
                }else{
                    searchNextVariant();
                }                
            }
        }
        function searchNextVariant() {
            var prefix = prefixVariants[0];
            prefixVariants = prefixVariants.slice(1);
            that.findDirEntries(prefix, 
                resultSize - articlesWithTitleMatchingKeyword,
                onFoundGetContentUpdateUI
                );                
        }
        searchNextVariant();
        
    };


    ZIMArchive.prototype.findDirEntries = function(prefix, resultSize, callback) {
        var that = this;
        function getNextN(firstIndex) {
            //console.count(prefix);
            var next = function(index) {
                if (index >= firstIndex + resultSize || index >= that._file.articleCount){
                    callback(null);//signals end of search for this prefix variant
                    return;
                }
                return that._file.dirEntryByTitleIndex(index)
                .then(function resolveRedirects(de){
                    if(de.redirect){
                        var p = new Promise(function (resolve, reject){
                            that.resolveRedirect(de, function(targetde){
                                console.log(de.title +" redirected to " + targetde.title);
                                resolve(addDEOnPrefixMatch(targetde, prefix, index));                    
                            });    
                        });
                        return p;
                    }else{
                        if(waitForArticleReadCompletion)
                            return waitForArticleReadCompletion.then(()=>addDEOnPrefixMatch(de, prefix, index));
                        else
                            return addDEOnPrefixMatch(de, prefix, index);   
                    }
                }).then(next);
            };
            return next(firstIndex);
        }
        
        function addDEOnPrefixMatch(dirEntry, prefix, index) {
            // added prefix.toLowerCase to normalize the comparision
            // eg Game of thrones gets redirected to Game of Thrones but fails here without normalization
            if (dirEntry.title.slice(0, prefix.length).toLowerCase() === prefix.toLowerCase() && dirEntry.namespace === "A"){
                console.log(dirEntry.title + " matched");
                callback(dirEntry);
            }else{
                console.log(dirEntry.title);
            }
            return index + 1;
        }
        //console.count(prefix);
        // why is lowerbound true? If nothing found getN will run?
        util.binarySearch(0, this._file.articleCount, function(i) {
            //console.count("binsearchsteps")
            return that._file.dirEntryByTitleIndex(i).then(function(dirEntry) {
                if (dirEntry.title === "")
                    return -1; // ZIM sorts empty titles (assets) to the end
                else if (dirEntry.namespace < "A")
                    return 1;
                else if (dirEntry.namespace > "A")
                    return -1;
                return prefix <= dirEntry.title ? -1 : 1;
            });
        }, true)
        .then(getNextN);
        
    };


    /**
     * Look for DirEntries with title starting with the given prefix (case-sensitive)
     * 
     * @param {String} prefix
     * @param {Integer} resultSize
     * @param {callbackDirEntryList} callback
     */
    ZIMArchive.prototype.findDirEntriesWithPrefixCaseSensitive = function(prefix, resultSize, callback) {
        var that = this;
        //console.count(prefix);
        util.binarySearch(0, this._file.articleCount, function(i) {
            //console.count("binsearchsteps")
            return that._file.dirEntryByTitleIndex(i).then(function(dirEntry) {
                if (dirEntry.title === "")
                    return -1; // ZIM sorts empty titles (assets) to the end
                else if (dirEntry.namespace < "A")
                    return 1;
                else if (dirEntry.namespace > "A")
                    return -1;
                return prefix <= dirEntry.title ? -1 : 1;
            });
        }, true).then(function(firstIndex) {
            var dirEntries = [];
            var addDirEntries = function(index) {
                //console.count("addDE");    
                if (index >= firstIndex + resultSize || index >= that._file.articleCount)
                    return dirEntries;
                return that._file.dirEntryByTitleIndex(index).then(function(dirEntry) {
                    if (dirEntry.title.slice(0, prefix.length) === prefix && dirEntry.namespace === "A"){
                        //console.log(dirEntry.title + " added");
                        dirEntries.push(dirEntry);
                    }else{
                        console.log(dirEntry.title);
                    }
                    return addDirEntries(index + 1);
                });
            };
            return addDirEntries(firstIndex);
        }).then(callback);
    };
    
    /**
     * @callback callbackDirEntry
     * @param {DirEntry} dirEntry The DirEntry found
     */

    /**
     * 
     * @param {DirEntry} dirEntry
     * @param {callbackDirEntry} callback
     */
    ZIMArchive.prototype.resolveRedirect = function(dirEntry, callback) {
        this._file.dirEntryByUrlIndex(dirEntry.redirectTarget).then(callback);
    };
    
    /**
     * @callback callbackStringContent
     * @param {String} content String content
     */
    
    /**
     * 
     * @param {DirEntry} dirEntry
     * @param {callbackStringContent} callback
     */
    ZIMArchive.prototype.readArticle = function(dirEntry, callback) {
        dirEntry.readData().then(function(data) {
            // This generates many asset loads all async
            callback(dirEntry.title, utf8.parse(data));
        });
    };

    /**
     * @callback callbackBinaryContent
     * @param {Uint8Array} content binary content
     */

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

        // If no namespace is mentioned, it's an article, and we have to add it
        if (regexpTitleWithoutNameSpace.test(url)) {
            url= "A/" + url;
        }
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

    // Takes a list of image urls, starts N workers distributing urls among them
    // When results are ready onResultCallbacks are called. Look at finder module for details 
    ZIMArchive.prototype.findImages = function(urllist, onResultCallbacks){
        var f = new finder.init(urllist, onResultCallbacks, this);
        f.run("quick");
    }

    /**
     * Functions and classes exposed by this module
     */
    return {
        ZIMArchive: ZIMArchive
    };
});
