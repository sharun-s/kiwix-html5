/**
 * zimfile.js: Low-level ZIM file reader.
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
define(['xzdec_wrapper', 'util', 'utf8', 'zimDirEntry', 'module'], function(xz, util, utf8, zimDirEntry, module) {

    var readInt = function(data, offset, size)
    {
        var r = 0;
        for (var i = 0; i < size; i++)
        {
            var c = (data[offset + i] + 256) & 0xff;
            r += util.leftShift(c, 8 * i);
        }
        return r;
    };

    /**
     * A ZIM File
     * 
     * See http://www.openzim.org/wiki/ZIM_file_format#Header
     * 
     * @typedef ZIMFile
     * @property {Array.<File>} _files Array of ZIM files
     * @property {Integer} articleCount total number of articles
     * @property {Integer} clusterCount total number of clusters
     * @property {Integer} urlPtrPos position of the directory pointerlist ordered by URL
     * @property {Integer} titlePtrPos position of the directory pointerlist ordered by title
     * @property {Integer} clusterPtrPos position of the cluster pointer list
     * @property {Integer} mimeListPos position of the MIME type list (also header size)
     * @property {Integer} mainPage main page or 0xffffffff if no main page
     * @property {Integer} layoutPage layout page or 0xffffffffff if no layout page
     * 
     */
    
    /**
     * @param {Array.<File>} abstractFileArray
     */
    function ZIMFile(abstractFileArray)
    {
        this._files = abstractFileArray;
        this.sliceSize = 0;
    }

    /**
     * 
     * @param {Integer} offset
     * @param {Integer} size
     * @returns {Integer}
     */
    ZIMFile.prototype._readInteger = function(offset, size)
    {
        return this._readSlice(offset, size).then(function(data)
        {
            return readInt(data, 0, size);
        });
    };

    ZIMFile.prototype.sliceToFileName = function(slice){
        var slices = Math.floor(this._files[0].size / (this.sliceSize));
        return this._files[0].name +'/'+ slice.toString().padStart(slices.toString().length, "0");
    }

    /**
     * 
     * @param {Integer} offset
     * @param {Integer} size
     * @returns {Promise}
     */
    ZIMFile.prototype._readSlice = function(offset, size)
    {
        var readRequests = [];
        var currentOffset = 0;
        
        var sliceSize = this.sliceSize;
        var slice = Math.floor(offset / sliceSize);
        var slicename = this.sliceToFileName(slice);
        //console.log(slicename); 
        var endSlice = Math.floor((offset + size) / sliceSize);
        
        currentOffset = offset % sliceSize;
        var endOffset = (offset + size) % sliceSize 
        //console.log(offset, size, slice, currentOffset, endSlice, endOffset);
        if (slice == endSlice){
            //console.log( slicename.slice(-5), currentOffset, endOffset);
              readRequests.push(util.readSlice(slicename, currentOffset, endOffset));
        }else{
            //console.log("CROSS slice", slicename.slice(-5), currentOffset, sliceSize);
            readRequests.push(util.readSlice(slicename, currentOffset, sliceSize));
            slice = slice + 1;
            slicename = this.sliceToFileName(slice);
            //console.log(slicename);
            while(slice < endSlice)
            {
                //console.log("CROSS slice", slicename.slice(-5), 0, sliceSize);
                readRequests.push(util.readSlice(slicename, 0, sliceSize));
                slice = slice + 1;
                slicename = this.sliceToFileName(slice);
                //console.log(slicename);
            }
            //console.log("CROSS slice", slicename.slice(-5), 0, endOffset);
            readRequests.push(util.readSlice(slicename, 0, endOffset));
        }
        
        
        if (readRequests.length == 0) {
            return Promise.resolve().then(() => {return new Uint8Array(0).buffer;},(err)=> { throw err;});
        } else if (readRequests.length == 1) {
            //console.log(readRequests[0]);
            return readRequests[0];//.then(
              //(ml) => { return ml;}//,
              //(err)=> { 
                //console.error("Error reading file " + file + " status:" + err.target.status + ", statusText:" + err.target.statusText);
                //throw err;
              //}
              //);
        } else {
            // Wait until all are resolved and concatenate.
            return Promise.all(readRequests).then(function(arrays) {
                //console.log("CONCAT", arrays.length, readRequests.length);
                var concatenated = new Uint8Array(size);
                var sizeSum = 0;
                for (var i = 0; i < arrays.length; ++i) {
                    concatenated.set(new Uint8Array(arrays[i]), sizeSum);
                    sizeSum += arrays[i].byteLength;
                }
                //console.log(concatenated);
                return concatenated;
            });
        }
    };

    /**
     * 
     * @param {Integer} offset
     * @returns {DirEntry} DirEntry
     */
    ZIMFile.prototype.dirEntry = function(offset)
    {
        var that = this;
        return this._readSlice(offset, 2048).then(function(data)
        {
            var dirEntry =
            {
                offset: offset,
                mimetype: readInt(data, 0, 2),
                namespace: String.fromCharCode(data[3])
            };
            dirEntry.redirect = (dirEntry.mimetype === 0xffff);
            if (dirEntry.redirect)
                dirEntry.redirectTarget = readInt(data, 8, 4);
            else
            {
                dirEntry.cluster = readInt(data, 8, 4);
                dirEntry.blob = readInt(data, 12, 4);
            }
            var pos = dirEntry.redirect ? 12 : 16;
            if (data.subarray){
                dirEntry.url = utf8.parse(data.subarray(pos), true);
                while (data[pos] !== 0)
                    pos++;
                dirEntry.title = utf8.parse(data.subarray(pos + 1), true);
                return new zimDirEntry.DirEntry(that, dirEntry);
            } else {
                return null;
            }
        });
    };

    /**
     * 
     * @param {Integer} index
     * @returns {DirEntry} DirEntry
     */
    ZIMFile.prototype.dirEntryByUrlIndex = function(index, cache)
    {
        var that = this;
        if (cache && cache.has(index)){
            return Promise.resolve().then(() => cache.get(index));
        }
        //console.count("readURLIndex");
        return this._readInteger(this.urlPtrPos + index * 8, 8).then(function(dirEntryPos)
        {
            var temp = that.dirEntry(dirEntryPos);
            if(cache)
                cache.set(index, temp);
            return temp;
        });
    };

    /**
     * 
     * @param {Integer} index
     * @returns {DirEntry} DirEntry
     */
    ZIMFile.prototype.dirEntryByTitleIndex = function(index)
    {
        var that = this;
        return this._readInteger(this.titlePtrPos + index * 4, 4).then(function(urlIndex)
        {
            return that.dirEntryByUrlIndex(urlIndex);
        });
    };

    /**
     * 
     * @param {Integer} cluster
     * @param {Integer} blob
     * @returns {Promise} that resolves to a String
     */
    ZIMFile.prototype.blob = function(cluster, blob)
    {
        var that = this;
        return this._readSlice(this.clusterPtrPos + cluster * 8, 16).then(function(clusterOffsets)
        {
            var clusterOffset = readInt(clusterOffsets, 0, 8);
            //var nextCluster = readInt(clusterOffsets, 8, 8);
            return that._readSlice(clusterOffset, 1).then(function(compressionType) {
                var decompressor;
                var plainBlobReader = function(offset, size) {
                    //console.log('pbr',offset,size);
                    return that._readSlice(clusterOffset + 1 + offset, size);
                };
                if (compressionType[0] === 0 || compressionType[0] === 1) {
                    //console.log('uncompressed _readslice');
                    decompressor = { readSlice: plainBlobReader };
                } else if (compressionType[0] === 4) {
                    decompressor = new xz.Decompressor(plainBlobReader);
                } else {
                    return new Uint8Array(); // unsupported compression type
                }
                //console.log('decompresor: bloboffset - ',blob*4,'size -', 8);
                return decompressor.readSlice(blob * 4, 8).then(function(data) {
                    var blobOffset = readInt(data, 0, 4);
                    var nextBlobOffset = readInt(data, 4, 4);
                    //console.log('decompressor passed: blob - ',blobOffset,'size -', nextBlobOffset - blobOffset);
                    return decompressor.readSlice(blobOffset, nextBlobOffset - blobOffset);
                });
            });//, function(err){throw err;});
        });
    };

    return {
        /**
         * 
         * @param {Array.<File>} fileArray
         * @returns {Promise}
         */
        fromFileArray: function(fileArray) {
            // Array of blob objects should be sorted by their name property
            fileArray.sort(function(a, b) {
                  var nameA = a.name.toUpperCase(); 
                  var nameB = b.name.toUpperCase(); 
                  if (nameA < nameB) {
                    return -1;
                  }
                  if (nameA > nameB) {
                    return 1;
                  }
                  return 0;
            });
            return util.readSlice(fileArray[0], 0, 80).then(function(header)
            {
                var zf = new ZIMFile(fileArray);
                zf.articleCount = readInt(header, 24, 4);
                zf.clusterCount = readInt(header, 28, 4);
                zf.urlPtrPos = readInt(header, 32, 8);
                zf.titlePtrPos = readInt(header, 40, 8);
                zf.clusterPtrPos = readInt(header, 48, 8);
                zf.mimeListPos = readInt(header, 56, 8);
                zf.mainPage = readInt(header, 64, 4);
                zf.layoutPage = readInt(header, 68, 4);
                return zf;
            });
        },
        create: function(fromString){
            var temp = JSON.parse(fromString);
            var zf = new ZIMFile(temp._file._files);
            //zf.sliced = temp.type == 'directory' ? true : false;
            zf.sliceSize = temp.slice;
            zf.articleCount = temp._file.articleCount;
            zf.clusterCount = temp._file.clusterCount;
            zf.urlPtrPos = temp._file.urlPtrPos;
            zf.titlePtrPos = temp._file.titlePtrPos;
            zf.clusterPtrPos = temp._file.clusterPtrPos;
            zf.mimeListPos = temp._file.mimeListPos;
            zf.mainPage = temp._file.mainPage;
            zf.layoutPage = temp._file.layoutPage;
            return zf;
        }
    };
});
