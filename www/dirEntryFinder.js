var archive, articleCount, urlPtrPos, readSlice, wid;
// Remove to debug    
//console.log = function(){}     
//console.time = function(){};
//console.timeEnd =function(){};

function readInt(data, offset, size)
{
    var r = 0;
    for (var i = 0; i < size; i++)
    {
        c = (data[offset + i] + 256) & 0xff;
        r += leftShift(c, 8 * i);
    }
    return r;
};

function leftShift(int, bits) {return int * Math.pow(2, bits);}

function utf8parse(data, zeroTerminated)
{
    var u0, u1, u2, u3, u4, u5;

    var str = '';
    for (var idx = 0; idx < data.length; ) {
        u0 = data[idx++];
        if (u0 === 0 && zeroTerminated)
            return {str:str,endIndex:idx};
        if (!(u0 & 0x80))
        {
            str += String.fromCharCode(u0);
            continue;
        }
        u1 = data[idx++] & 63;
        if ((u0 & 0xe0) == 0xc0)
        {
            str += String.fromCharCode(((u0 & 31) << 6) | u1);
            continue;
        }
        u2 = data[idx++] & 63;
        if ((u0 & 0xf0) == 0xe0)
            u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
        else
        {
            u3 = data[idx++] & 63;
            if ((u0 & 0xF8) == 0xF0)
                u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | u3;
            else
            {
                u4 = data[idx++] & 63;
                if ((u0 & 0xFC) == 0xF8)
                    u0 = ((u0 & 3) << 24) | (u1 << 18) | (u2 << 12) | (u3 << 6) | u4;
                else
                {
                    u5 = data[idx++] & 63;
                    u0 = ((u0 & 1) << 30) | (u1 << 24) | (u2 << 18) | (u3 << 12) | (u4 << 6) | u5;
                }
            }
        }
        if (u0 < 0x10000)
            str += String.fromCharCode(u0);
        else
        {
            var ch = u0 - 0x10000;
            str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
        }
    }
    return str;
};


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

function readFileSlice(file, begin, size) {
    return new Promise(function (resolve, reject){
        var reader = new FileReader();
        reader.onload = function(e) {
            resolve(new Uint8Array(e.target.result));
        };
        reader.onerror = reader.onabort = function(e) {
            reject(e);
        };
        reader.readAsArrayBuffer(file.slice(begin, begin + size));
    });    
}


function readXHRSlice(file, begin, size) {
    return new Promise(function (resolve, reject){
        var req = new XMLHttpRequest();
        req.onload = function(e){            
            resolve(new Uint8Array(e.target.response));
        };
        req.onerror = req.onabort = function(e) {
            reject(e);
        }; 
        req.open('GET', file.name, true); 
        req.responseType = "arraybuffer";
        var end = begin + size;
        req.setRequestHeader('Range', 'bytes='+begin+'-'+end);
        req.send(null);
    }); 
}

function readFFXHRSlice(file, begin, size){
    return new Promise(function (resolve, reject){
        var req = new XMLHttpRequest();
        req.open('GET', file.name, true); 
        if (location.protocol == 'file:') {
            //console.log("blobloader");
            req.responseType = "blob";
            req.onload = function(e) {
                var sliced = e.target.response.slice(begin, begin+size);
                var fr = new FileReader();
                fr.readAsArrayBuffer(sliced);
                fr.addEventListener("load", function() {
                    resolve(new Uint8Array(fr.result));
                });
            };
        } else {
            req.responseType = "arraybuffer";
            var end = begin + size;
            req.setRequestHeader('Range', 'bytes='+begin+'-'+end);
            req.onload = function(e) {
                resolve(new Uint8Array(e.target.response));
            };
        }
        req.onerror = req.onabort = function(e) {
            reject(e);
        }; 
        req.send(null);
    });
}


function dirEntryByUrlIndex(index, cache)
{
    var that = this;
    if (cache && cache.has(index)){
        return Promise.resolve().then(() => cache.get(index));
    }
    //console.count("readURLIndex");
    //return readXHRSlice(urlPtrPos + index * 8, 8).then(function(data)
    return readSlice(archive, urlPtrPos + index * 8, 8).then(function(data)
        {
            return readInt(data, 0, 8);
        }).then(function(dirEntryPos)
        {
        var temp = dirEntryByOffset(dirEntryPos);
        if(cache)
            cache.set(index, temp);
        return temp;
    });
};

function zimDirEntry(dirEntryData) {
    return {
    redirect : dirEntryData.redirect,
    offset : dirEntryData.offset,
    mimetype : dirEntryData.mimetype,
    namespace : dirEntryData.namespace,
    redirectTarget : dirEntryData.redirectTarget,
    cluster : dirEntryData.cluster,
    blob : dirEntryData.blob,
    url : dirEntryData.url,
    title : dirEntryData.title};
};


// formerly zimfile.dirEntry(offset)
function dirEntryByOffset(offset)
{
    var that = this;
    //return readXHRSlice(offset, 2048).then(function(data)
    return readSlice(archive, offset, 2048).then(function(data)    
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
        dirEntry.url = utf8parse(data.subarray(pos), true).str;
        while (data[pos] !== 0)
            pos++;
        dirEntry.title = utf8parse(data.subarray(pos + 1), true).str;
        // [TODO] this call is extra remove
        return new zimDirEntry(dirEntry);
    });
};


function binarySearch(begin, end, query, lowerBound) {
    if (end <= begin)
        return lowerBound ? begin : null;
    var mid = Math.floor((begin + end) / 2);
    return query(mid).then(function(decision)
    {
        if (decision < 0)
            return binarySearch(begin, mid, query, lowerBound);
        else if (decision > 0)
            return binarySearch(mid + 1, end, query, lowerBound);
        else
            return mid;
    });
};


function readImageDirEnt(url) {
    //var image = $(img.value);//$(this);
    // It's a standard image contained in the ZIM file
    // We try to find its name (from an absolute or relative URL)
    //var imageMatch = image.attr("data-src").match(regexpImageUrl);
    //if (imageMatch) {
        //var url = decodeURIComponent(imageMatch[1]);
        //each time this is causing a binary search
        //var p = selectedArchive.getDirEntryByURL(url, sessionCache);
        //this check is unnecessary as its an image
        /*if (regexpTitleWithoutNameSpace.test(url)) {
            url= "A/" + url;
        }*/
        if (loadingCache && loadingCache.has(url)){
            return Promise.resolve().then(() => loadingCache.get(url));
        }
        //var pb = 
        return binarySearch(0, articleCount, 
                    function compare(i) {
                        return dirEntryByUrlIndex(i, loadingCache).then(function (dirEntry){
                            var foundurl = dirEntry.namespace + "/" + dirEntry.url;
                            //console.log(title+" "+url);
                            if (url < foundurl)
                                return -1;
                            else if (url > foundurl)
                                return 1;
                            else
                                return 0;
                            });
                        }            
                ).then(function (index){
                    if (index === null){ 
                        console.error("bsearch returned null"); 
                        return null;
                    }
                    return dirEntryByUrlIndex(index);
                }).then( function (dirEntry){
                        if(loadingCache)
                            loadingCache.set(url, dirEntry);
                        return dirEntry;
                });
            //return pb.then(function (dirent){return Promise.resolve();}, function (){console.error("could not find dirent");});
            //});        
        //return p;
    //}else{
    //    console.count("image_unmatched_url");
    //    console.log(image.attr('data-src'));
    //    return image.attr('data-src');
    //}
}

function startChain(id) {
  var cnt = 0;
  
  return Promise.resolve().then(function next() {
        var image = images.next();
        if (!image.done) {
            cnt++;
            var c = images.current();
            var p = readImageDirEnt(image.value);
            p.then(function (val){
                // the second arg past back is the index into the jquery image collection
                //console.log(nodestart + images.current());
                //postMessage([nodestart + c, val]);
                postMessage([c, val]);
            });
            return p.then(next); // continue the chain
        }else{
            //console.timeEnd("DirEntryFinder:chain"+id);
            return cnt; //resolve and stop chain
        }
    });
}


/* var images = makeIterator($('#articleContent img'));

var imageArray = [];    
$('#articleContent img').each(function (){
    var image = $(this);
    console.log(image.attr("data-src"));
    var imageMatch = image.attr("data-src").match(regexpImageUrl);
    if(imageMatch)
        imageArray.push(decodeURIComponent(imageMatch[1]));
});
console.log(imageArray);
*/

function start(){
    //console.profile("completePageLoad")
    console.time("DEFinder"+wid+":loadImages");
    for (var k = 0; k < N; k += 1) {
        var id = k +1;
        //console.time("DirEntryFinder:chain"+id)
        imagePromises.push(startChain(id));
    }

    Promise.all(imagePromises).then(function(val){
        //console.log(val);
        //console.log(loadingCache.size);
        //console.profileEnd("completePageLoad")
        console.timeEnd("DEFinder"+wid+":loadImages");
        //console.log('Posting message back to main script');
        postMessage(["done",null]);
    });    
}

var images;
var imagePromises, loadingCache;
var N = 2;
function init(){
    imagePromises = [];
    loadingCache = new Map();
    images = makeIterator(imageArray);//.slice(0,100));
    //images = makeIterator(Array.from(new Set(imageArray)));

    if(archive){
        //console.log("DirEntryFinder starting...");
        start();
    }else{
        console.error("DirEntryFinder archive not set");
    }
}

function isFireFox(){
    return typeof InstallTrigger !== 'undefined';
}
    
onmessage = function(e) {
  console.log('starting worker...');
  archive = e.data[0]; 
  articleCount = e.data[1];
  urlPtrPos = e.data[2];
  wid = e.data[3];//Math.floor(e.data[3])+"-"+Math.floor(e.data[4]);
  //nodestart= Math.floor(e.data[3]);
  imageArray = e.data[4]; //Array.from(new Set(e.data[5])); // don't look up dups
  if (e.data[5] == "file") {
    readSlice = readFileSlice;
  }else if( e.data[5] == "xhrFF"){
    readSlice = readFFXHRSlice;
  }else{
    readSlice = readXHRSlice;
  } 
  //debugger;
  init();
}