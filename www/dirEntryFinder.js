//Takes a list of URL's and returns corresponding direntries
//Speed is achieved by using a cache that minimizes repeating binary search steps during lookup 

var archive, articleCount, urlPtrPos, titlePtrPos, readSlice, wid;
var imageArray, keyword, maxResults, matcherfn;
//Comment out to disable logs and timing    
console.log = function(){}     
console.time = function(){};
console.timeEnd =function(){};

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

function dirEntryByTitleIndex(index)
{
    return readSlice(archive, titlePtrPos + index * 4, 4).then(function(data){
        return readInt(data, 0, 4);        
    }).then(function(urlIndex)
    {
        return dirEntryByUrlIndex(urlIndex);
    });
};

// formerly zimfile.dirEntry(offset)
function dirEntryByOffset(offset)
{
    var that = this;
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
        // TODO: Remove unused props
        return {
            redirect : dirEntry.redirect,
            offset : dirEntry.offset,
            mimetype : dirEntry.mimetype,
            namespace : dirEntry.namespace,
            redirectTarget : dirEntry.redirectTarget,
            cluster : dirEntry.cluster,
            blob : dirEntry.blob,
            url : dirEntry.url,
            title : dirEntry.title
        };
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
    if (url==="") return null; 
    if (loadingCache && loadingCache.has(url)){
        return Promise.resolve().then(() => loadingCache.get(url));
    }
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
                postMessage([c, val]);
            });
            return p.then(next); // continue the chain
        }else{
            return cnt; //resolve and stop chain
        }
    });
}

var images;
var imagePromises, loadingCache;
var N = 2; // can be much higher on newer (desktop) browsers
function init(){
    imagePromises = [];
    loadingCache = new Map();
    images = makeIterator(imageArray);//.slice(0,100));
    //images = makeIterator(Array.from(new Set(imageArray)));
    if(archive){
        console.time("DEFinder"+wid+":loadImages");
        // Multiple chains are faster than a single chain
        // since jobs can queue up behind a particular long op.
        // To see how many jobs each chain ends up processing inspect "cnt" after each chain is done 
        // Note: Optimal N is browser dependent 
        for (var k = 0; k < N; k += 1) {
            var id = k +1;
            imagePromises.push(startChain(id));
        }
        Promise.all(imagePromises).then(function(val){
            //console.log(val);//console.log(loadingCache.size);            
            console.timeEnd("DEFinder"+wid+":loadImages");
            postMessage(["done",null]);
        });    
    }else{
        console.error("DirEntryFinder archive not set");
    }
}

function resolveRedirect(dirEntry, callback) {
    dirEntryByUrlIndex(dirEntry.redirectTarget).then(callback);
};

function getNextN(firstIndex) {
    //console.count(keyword);
    var next = function(index) {
        if (index >= firstIndex + maxResults){
            postMessage(["done", matchesFound, index]);//signals end of search for this prefix variant;
            return;
        }

        if(index >= articleCount){
            postMessage(["done", matchesFound, undefined]);
            return;
        }

        return dirEntryByTitleIndex(index)
        .then(function resolveRedirects(de){
            if(de.redirect){
                var p = new Promise(function (resolve, reject){
                    resolveRedirect(de, function(targetde){
                        console.log(de.title +" redirected to " + targetde.title);
                        targetde.redirectedFrom = de.title;
                        resolve(matchAndIncrement(targetde, index));                    
                    });    
                });
                return p;
            }else{
                return matchAndIncrement(de, index);   
            }
        }).then(next);
    };
    return next(firstIndex);
}

// if no matcherfn return dirEntry and increment - allows for iterating over the whole index
// if matcherfn returns true return dirEntry and increment 
function matchAndIncrement(dirEntry, index){
    if(matcherfn){
        if(matcherfn(dirEntry)){
            matchesFound++;
            postMessage([dirEntry]);
        }
    }else{
        matchesFound++;
        postMessage([dirEntry]); 
    }
    return index + 1;
}

// DirEntry being read is passed to one of these matcherfn's
// Matcherfn returns true on match and false on no match
// Right now user specified keyword is global in the worker context and can be used within the function
// Matching doesn't need to rely on keyword. Can be based on namespace, file extn, size, dimensions, regex etc. 
// TODO Searchbar can/should provide a mechanism for UI (either thro spl reserved keywords or buttons/dropdowns) to pick the reqd matcherfn
matcherTable = {
    'PrefixAndArticleMatch' : PrefixAndArticleMatch,
    'SubstringMatch' : IncludeMatch,
    'All' : function MatchEverything(){return true},
    'NoMatch' : function NoMatch(){return false}
}
// TODO how much further should iteration continue if no match at all - in case of non prefix matching makes sense to continue till max_iteration_count|max_results|articleCount
// For case variants that are not showing any matches no need to keep traversing. 
function PrefixAndArticleMatch(dirEntry) {
    if (dirEntry.hasOwnProperty("redirectedFrom")){
        if ( dirEntry.redirectedFrom.slice(0, keyword.length) === keyword && dirEntry.title.slice(0, keyword.length) === keyword && dirEntry.namespace === "A" ){
            //Probable dup/disambiguation/spelling redirect
            console.log(dirEntry.title + " matched -- both orig & redirect");
            return true;
        } else if (dirEntry.redirectedFrom.slice(0, keyword.length) === keyword && dirEntry.namespace === "A"){
            console.log(dirEntry.title + " matched -- orig not redirect");
            return true;
        } else if (dirEntry.title.slice(0, keyword.length) === keyword && dirEntry.namespace === "A"){
            // TODO this case is probably unnecessary and can be removed.
            console.log(dirEntry.title + " matched -- weird case -- only redirect matched");  
            return true;
        } else {
            // TODO these cases shouldnt be happening - unnecessary.
            console.log("non matched redirect "+ dirEntry.redirectedFrom + " > "+ dirEntry.title);
        }      
    }else{
        if (dirEntry.title.slice(0, keyword.length) === keyword && dirEntry.namespace === "A"){
            console.log(dirEntry.title + " matched");
            return true;
        }else{
            // useful to see when variants aren't matching anything. 
            // [TODO] Beyond a point should really disable search? (by tracking number of iterations)
            console.log(dirEntry.title);
        }
    }
    return false;
}

function IncludeMatch(dirEntry) {
    return dirEntry.title.includes(keyword);
}

var matchesFound, loadmore;
function initKeywordSearch(index){
    matchesFound = 0;
    loadingCache = new Map();
    // finder is requesting start search from index. If index not given, do a binarySearch with keyword to locate it.
    if (loadmore || keyword == ""){
        console.log("from: " + index);
        
        //dirEntryByTitleIndex(index).then(getNextN);
        // NOTE: NO NAMESPACE CHECK HAPPENS HERE - CAREFUL!!
        getNextN(index);
    }else{
        binarySearch(0, articleCount, function(i) {
            //console.count("binsearchsteps")
            return dirEntryByTitleIndex(i).then(function(dirEntry) {
                if (dirEntry.title === "")
                    return -1; // ZIM sorts empty titles (assets) to the end
                else if (dirEntry.namespace < "A")
                    return 1;
                else if (dirEntry.namespace > "A")
                    return -1;
                return keyword <= dirEntry.title ? -1 : 1;
            });
        }, true)
        .then(getNextN);        
    }
}

    
onmessage = function(e) {
  // for url->dirents an array of urls is passed (article loading image urls) 
  // for title->dirent a keyword is passed (via search bar or url)
  if (typeof e.data[4] !== 'string'){  
      archive = e.data[0]; 
      articleCount = e.data[1];
      urlPtrPos = e.data[2];
      wid = e.data[3];
      imageArray = e.data[4]; //Array.from(new Set(e.data[5])); // don't look up dups
      if (e.data[5] == "file") {
        readSlice = readFileSlice;
      }else if( e.data[5] == "xhrFF"){
      console.log("WARNING: direntryfinder is using xhrff workaround - very slow compared to file based access");
        readSlice = readFFXHRSlice;
      }else{
        readSlice = readXHRSlice;
      } 
      init();
    }else
    {
      archive = e.data[0]; 
      articleCount = e.data[1];
      urlPtrPos = e.data[2];
      titlePtrPos = e.data[3];
      keyword = e.data[4];
      maxResults = e.data[5]; 
      if (e.data[6] == "file") {
        readSlice = readFileSlice;
      }else if( e.data[6] == "xhrFF"){
      console.log("WARNING: direntryfinder is using xhrff workaround - very slow compared to file based access");
        readSlice = readFFXHRSlice;
      }else{
        readSlice = readXHRSlice;
      }
      matcherfn = matcherTable[e.data[8]];
      console.log("MATCHER: " + matcherfn.name);
      loadmore = e.data[9];
      // e.data[7] from index
      //debugger;
      initKeywordSearch(e.data[7]);
      
    }
}