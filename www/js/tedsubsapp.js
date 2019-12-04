'use strict';
define(['jquery','xzdec_wrapper', 'utf8'], function($,xz, utf8) {


    var knownArchives = { 
        ted:'{"_file":{"_files":[{"name":"ted_en_technology_2018-07.zim","size":62695819637}],"articleCount":20224,"clusterCount":1726,"urlPtrPos":255,"titlePtrPos":186487,"clusterPtrPos":1196961,"mimeListPos":80,"mainPage":20998,"layoutPage":4294967295},"_language":""}'         
    };

    function readInt(data, offset, size)
    {
        var r = 0;
        for (var i = 0; i < size; i++)
        {
            var c = (data[offset + i] + 256) & 0xff;
            r += (c * Math.pow(2, 8 * i));
        }
        return r;
    };

    function read(f, begin, size) {
        return new Promise(function (resolve, reject){
            var reader = new FileReader();
            reader.onload = function(e) {
                resolve(new Uint8Array(e.target.result));
            };
            reader.onerror = reader.onabort = function(e) {
                reject(e);
            };
            reader.readAsArrayBuffer(f.slice(begin, begin + size));
        });
    }

    function getDE(f, offset)
    {
        return read(f, offset, 2048).then(function(data)
        {
            var dirEntry =
            {
                //offset: offset,
                mimetype: readInt(data, 0, 2),
                namespace: String.fromCharCode(data[3])
            };
            dirEntry.redirect = (dirEntry.mimetype === 0xffff);
            if (dirEntry.redirect){
                // this is really dirEntry.redirectTarget. doing this to keep record size uniform 
                dirEntry.cluster = readInt(data, 8, 4);
                dirEntry.blob = 0;
            }else
            {
                dirEntry.cluster = readInt(data, 8, 4);
                dirEntry.blob = readInt(data, 12, 4);
            }
            dirEntry.url = '';
            dirEntry.title = '';
            var pos = dirEntry.redirect ? 12 : 16;
            if (data.subarray){
                dirEntry.url = utf8.parse(data.subarray(pos), true);
                while (data[pos] !== 0)
                    pos++;
                 dirEntry.title = utf8.parse(data.subarray(pos + 1), true);
                return dirEntry;
            } else {
                return null;
            }
        });
    };

    function getWholeSortedUrlIndex()
    {
        return read(file, a.urlPtrPos, 8*a.articleCount).then(function(data)
        {
            console.time('fill');
            console.log(data.length, a.articleCount);
            for (var j = 0; j < a.articleCount*8; j=j+8) {
                urlidx.push(readInt(data, j, 8));
            };
            console.timeEnd('fill');
            //return readInt(data, 0, 8);
        });/*.then(function(dirEntryPos)
        {
            var temp = getDE(file, dirEntryPos);
            return temp;
        });*/
    };
    // this doesn't seem to work above 1MB data:text/plain
    function downloadObjectAsCSV(filename){
        let minutes = Math.round((Date.now() - startTime) / 60000);
        let csv = obj2csv(index);
        let link = document.createElement('a')
        link.id = 'download-csv'
        link.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(csv));
        link.setAttribute('download', filename  +'-'+ N+ '-'+minutes+'-'+startIndex+'-'+endIndex+ '.csv');
        document.body.appendChild(link);
        document.querySelector('#download-csv').click();
    }

    function obj2csv(urlidx){
        let csv='';
        for(let row = 0; row < urlidx.length; row++){
            let keysAmount = Object.keys(urlidx[row]).length;
            let keysCounter = 0;
            //if {keysAmounts == 7} redirect 
            //if {keysAmounts == 8} articlescsv
            //if {keysAmounts > 8 } errorscsv 
            for(let key in urlidx[row]){
               csv += urlidx[row][key] + (keysCounter+1 < keysAmount ? '|' : '\r\n' );
               keysCounter++;
            }
            keysCounter = 0;
        }
        return csv;
    }

    function downloadblob(format){
        let link = document.createElement('a')
        // there is an upper limit to downloadable blob size so use DownloadObjectAsCSV for now
        var b;
        if (format == 'json'){
            b = new Blob([JSON.stringify(index)], {type: 'application/json'});
        }else {
            b = new Blob([obj2csv(index)]);    
        }
        link.href = URL.createObjectURL(b);        
        link.setAttribute('download', filename + '.csv');
        document.body.appendChild(link);
        link.click();    
    }

    function startChain(id) {
      var cnt = 0;  
      return Promise.resolve().then(function next() {
            var de = des.next();
            if (!de.done) {
                cnt++;
                var p = getDE(file, de.value);
                return p.then(function (direntry){
                        if(direntry.url.includes('_en')){
                            console.log(direntry.url);

                            return read(file, a.clusterPtrPos + direntry.cluster * 8, 16).then(function(clusterOffsets)
                            {
                                var clusterOffset = readInt(clusterOffsets, 0, 8);
                                var nextCluster = readInt(clusterOffsets, 8, 8);
                                //console.log(clusterOffset);
                                return read(file, clusterOffset, 1).then(function(compressionType) {
                                    var decompressor;
                                    var plainBlobReader = function(offset, size) {
                                        return read(file, clusterOffset + 1 + offset, size);
                                    };
                                    if (compressionType[0] === 0 || compressionType[0] === 1) {
                                        // uncompressed
                                        decompressor = { readSlice: plainBlobReader };
                                    } else if (compressionType[0] === 4) {
                                        decompressor = new xz.Decompressor(plainBlobReader);
                                    } else {
                                        return new Uint8Array(); // unsupported compression type
                                    }
                                    return decompressor.readSlice(direntry.blob * 4, 8).then(function(data) {
                                        var blobOffset = readInt(data, 0, 4);
                                        var nextBlobOffset = readInt(data, 4, 4);
                                        return decompressor.readSlice(blobOffset, nextBlobOffset - blobOffset);
                                    });
                                });
                            }).then(function (data){
                                data = utf8.parse(data);
                                data=data.replace("WEBVTT","");
                                data=data.replace(new RegExp("\\d\\d:\\d\\d:\\d\\d\.\\d\\d\\d --> \\d\\d:\\d\\d:\\d\\d\.\\d\\d\\d\\n",'g'),"");
                                data=data.replace(new RegExp("\\n",'g'),"");

                                direntry.subs=data;
                                index.push(direntry);
                                console.log(data);
                                //resolve();
                            });


                            // read(file, direntry.cluster, direntry.blob).then(function (data){
                            // data = utf8.parse(data);
                            // d.subs=data;
                            // index.push(d);
                            // //resolve();
                            // });
                        }
                }).then(next);
                //return p.then(next); // continue the chain
            }else{
                return cnt; //resolve and stop chain
            }
        });
    }


    function makeIterator(array) {
        var nextIndex = 0;
        
        return {
            current: function() { return nextIndex-1},
           next: function() {
               return nextIndex < array.length ?
                   {value: array[nextIndex++], done: false} :
                   {done: true};
           },
           length: array.length
        };
    }

var urlidx = [], index=[], errors=[], redirects=[], keyMatchingFileSelected='dummy';
var a; //= JSON.parse(knownArchives['test'])._file;
var file;// = a._files[0];
var readPromises = [];
var startIndex = 0;
var endIndex = 20224;
var N = 2;
//console.log(N);
var des, jobs=[];
var startTime = Date.now();

    var fileSelected = function()
    {
        console.time('DumpTime');
        var fileInput = document.querySelector("#myfile");
        file = fileInput.files[0];
        //console.log(file.name);
        // @@fudge!!!!!! just to get article count nothing else
        keyMatchingFileSelected = Object.keys(knownArchives).filter((i, idx, a) => {return JSON.parse(knownArchives[i])._file._files[0].name.includes( file.name);} )[0];
        a = JSON.parse(knownArchives[keyMatchingFileSelected])._file;
        //document.write(knownArchives[])
        getWholeSortedUrlIndex(a).then(() =>{
            des = makeIterator(urlidx.slice(startIndex, endIndex));    
            console.time('jobs'+N);
            for (var k = 0; k < N; k += 1) {
                var id = k +1;
                jobs.push(startChain(id));
            }
            Promise.all(jobs).then(function(){            
                console.timeEnd('jobs'+N);
                console.timeEnd('DumpTime');
                console.log(index.length);
                //downloadblob('csv');
                downloadObjectAsCSV(keyMatchingFileSelected);
            });    
        });
    };
    $("#myfile").on("change", fileSelected);

});