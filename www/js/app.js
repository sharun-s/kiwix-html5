/**
 * app.js : User Interface implementation
 * This file handles the interaction between the application and the user
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

// This uses require.js to structure javascript:
// http://requirejs.org/docs/api.html#define

define(['jquery', 'zimArchiveLoader', 'library', 'util', 'uiUtil', 'uiSearch', 'cookies', 'module', 'control', 'finder', 'utf8'],
 function($, zimArchiveLoader, library, util, ui, uiSearch, cookies, module, control, finder, utf8) {

    var settings  = module.config().settings;
    // Determines if Archives are read via FileReader or XHR Range Requests
    var READ_MODE = module.config().mode;
    // 'ParseAndLoad' vs 'InterceptAndLoad'
    var contentInjectionMode = 'ParseAndLoad';
    // Setup the default search context and search UI
    var searchContext = {from:settings.from, upto:settings.maxResults, match:settings.match, caseSensitive:settings.caseSensitive, loadmore:false};
    var selectedArchive = null;    
    var protocolHandlers = ["so://", "so-tags://", "so-page://", "so:", "wiki://", "wiki:"];
            
    // Compile some regular expressions needed to modify links
    var regexpImageLink = /^.?\/?[^:]+:(.*)/;
    var regexpPath = /^(.*\/)[^\/]+$/;
    // These regular expressions match both relative and absolute URLs, since late 2014, all ZIM files should use relative URLs
    var regexpImageUrl = /^(?:\.\.\/|\/)+(I\/.*)$/;
    var regexpMetadataUrl = /^(?:\.\.\/|\/)+(-\/.*)$/;
    // This regular expression matches the href of all <link> tags containing rel="stylesheet" in raw HTML
    var regexpSheetHref = /(<link\s+(?=[^>]*rel\s*=\s*["']stylesheet)[^>]*href\s*=\s*["'])([^"']+)(["'][^>]*>)/ig;
    // Stores a url to direntry mapping and is refered to/updated anytime there is a css lookup
    // When archive changes these caches will be reset. 
    var cssDirEntryCache = new Map();
    var cssBlobCache = new Map();
    // Promise that gets resolved after css load used to control article loading in ParseAndLoad mode
    var cssLoaded;
     
    // Disable any eval() call in jQuery : it's disabled by CSP in any packaged application
    // It happens on some wiktionary archives, because there is some javascript inside the html article
    // Cf http://forum.jquery.com/topic/jquery-ajax-disable-script-eval
    jQuery.globalEval = function(code) {
        // jQuery believes the javascript has been executed, but we did nothing
        // In any case, that would have been blocked by CSP for package applications
        console.log("jQuery tried to run some javascript with eval(), which is not allowed in packaged applications");
    };
    
    $(document).ready(ui.resizeIFrame);
    $(window).resize(ui.resizeIFrame);

    ui.setupHandlers();
    ui.onHome(goToMainArticle);
    ui.onRandom(goToRandomArticle);
    ui.onConfig(() => ui.archiveStatusUpdate(selectedArchive));
    uiSearch.setupHandlers(searchContext, settings.autoComplete);
    if(settings.autoComplete)
        $('#prefix').on('keyup', function(e) {
                if (selectedArchive !== null && selectedArchive.isReady()) 
                    ui.autoComplete(e, settings.autoCompleteResubmitTimer);
        });    
    $('#searchArticles').on('click', function(e) {
        startSearch($('#prefix').val(), true);
    });
    $('#searchImages').on('click', function(e) {
        searchContext.loadmore = false;
        startImageSearch($('#prefix').val());
    });    

    if (zimArchiveLoader.storageExists()) {
        zimArchiveLoader.findArchives(ui.populateListOfArchives);
        $('#archiveList').on('change', setLocalArchiveFromArchiveList);
        $('#btnRescanDeviceStorage').on("click", function(e) {
            $("#btnConfigure").click();
            $('#scanningForArchives').show();
            zimArchiveLoader.scanForArchives(ui.populateDropDownListOfArchives);
        });
    }else{ 
        // dislpay the fileselector TODO show maybe unnecessary as its always in view when config is clicked   
        $('#openLocalFiles').show();
        $('#archiveFiles').on('change', setLocalArchiveFromFileSelect);
        // Handle setting archive via URL
        var params={};
        location.search.replace(/[?&]+([^=&]+)=([^&]*)/gi,function(s,k,v){params[k]=v});
        if(params["archive"]){
            setLocalArchiveFromURL(params);
        }else{
	        // Display the file select components
            //if (document.getElementById('archiveFiles').files && document.getElementById('archiveFiles').files.length>0) {
                // Archive files are already selected, 
            //    setLocalArchiveFromFileSelect();
            //}else{
               $("#btnConfigure").click();
            //}
	    }
    }

    function startSearch(keyword, uiReset, uiKeywordSet){
        searchContext.keyword = keyword;
        if (uiReset)
            ui.reset();
        if (uiKeywordSet)
            $("#prefix").val(searchContext.keyword);
        searchContext.loadmore = false; // new search so loadmore must be reset.
        pushBrowserHistoryState(null, searchContext);
        $("title").html("Searching for " + searchContext.keyword);
        searchInit();
        search();        
    }
    
    function startImageSearch(keyword){
        searchContext.keyword = keyword;
        $("#prefix").val(searchContext.keyword);
        $("title").html("ImageSearch Results for "+ searchContext.keyword);
        pushBrowserHistoryState(null, null, searchContext.keyword);
        searchInit();
        searchForImages();        
    }

    // Going back in the browser history
    window.onpopstate = function(event) {
        if (event.state) {
            var title = event.state.title;
            var searchCtx = event.state.titleSearch;
            var imageSearch = event.state.imageSearch;
            ui.reset();
            if (title && !(""===title)) {
                goToArticle(title);
            }
            else if (searchCtx) {
                searchContext = searchCtx;
                uiSearch.update(searchContext);
                startSearch(searchCtx.keyword);
            }else if(imageSearch && !(""===imageSearch)){
                startImageSearch(searchCtx.keyword);
            }
        }
    };

    // In URL Mode, if a protocolHandler is registered remove the scheme in case its passed in  
    function removeURIScheme(param){
        var scheme = protocolHandlers.find((scheme) => param.startsWith(scheme));
        //console.log(scheme, param.substring(scheme.length),param);
        // chrome has different behavior for so: and so://, 
        // if so://keyword a '/' gets added to the end (keyword/) so remove it 
        if (scheme){
            if (param.endsWith("/"))
                return param.substring(scheme.length, param.length-1); 
            return param.substring(scheme.length);
        } else
            return param;
    }

    // Called when 'archive' param is specified in URL
    function setLocalArchiveFromURL(params){
        ui.reset();    
        selectedArchive = zimArchiveLoader.loadArchiveFromURL(params["archive"]);
        ui.archiveStatusUpdate(selectedArchive);                
        if(params["c"] && params["b"]){
            let tmptitle = params['title'].replace(/_/,' ').slice(0,-5);
            // This is for direct access to a particular cluster+blob via a url.
            // Enables script/query.sh to directly access an article via a 'destring'
            var destring = '||'+ params['n'] +'|' + params['c'] + '|' + params['b'] + '|'+params['title']+'|'+tmptitle+'||';
            pushBrowserHistoryState(params['title']);
            if (params['n'] == 'I' ){
                var dirEntry = selectedArchive.parseDirEntryId(destring);
                dirEntry.readData().then((data) =>{
                    var blob = new Blob([data], {type: 'image'});
                    var url = URL.createObjectURL(blob);
                    $('#articleContent').contents().find('body').html('<img src='+url+'></img>');                    
                });
            }
                //selectedArchive._file.blob(dirEntry.cluster, dirEntry.blob)
                //        .then((imageBlob) => checkTypeAndInject(dirEntry.url.toLowerCase(), $("articleContent"), imageBlob);
            else
                findDirEntryFromDirEntryIdAndLaunchArticleRead(destring);
        }else if(params["title"]){
            pushBrowserHistoryState(params["title"]);
            goToArticle(params["title"]);
        }
        else if(params.hasOwnProperty("titleSearch")){
            startSearch(decodeURIComponent(removeURIScheme(params["titleSearch"]), false, true));
        }else if(params["imageSearch"]){
            startImageSearch(decodeURIComponent(params["imageSearch"]));
        }else if("home" in params){
            goToMainArticle();
        }else if("random" in params){
            goToRandomArticle();
        }
        else{
            selectedArchive.getDirEntryByURL("M/Counter").then(function(dirEntry) {
                selectedArchive.readArticle(dirEntry, 
                    (de,content) => $('#articleContent').contents().find('body').html("Loaded Archive: <strong class='label-primary'>"+selectedArchive._file._files[0].name+"</strong>. It contains:<br>"+
                        content.split(';').join('<br>')+
                        "<br>Total Document Count:" + selectedArchive._file.articleCount));
            });
        }
    }

    // Currently used only in FFOS. Sets the localArchive from the selected archive in the drop-down list
    function setLocalArchiveFromArchiveList() {
        var archiveDirectory = $('#archiveList').val();
        if (archiveDirectory && archiveDirectory.length > 0) {
            // Now, try to find which DeviceStorage has been selected by the user
            // It is the prefix of the archive directory
            var regexpStorageName = /^\/([^\/]+)\//;
            var regexpResults = regexpStorageName.exec(archiveDirectory);
            var selectedStorage = null;
            if (regexpResults && regexpResults.length>0) {
                var selectedStorageName = regexpResults[1];
                for (var i=0; i<storages.length; i++) {
                    var storage = zimArchiveLoader.storages[i];// prob needs a getter
                    if (selectedStorageName === storage.storageName) {
                        // We found the selected storage
                        selectedStorage = storage;
                    }
                }
                if (selectedStorage === null) {
                    alert("Unable to find which device storage corresponds to directory " + archiveDirectory);
                }
            }
            else {
                // This happens when the archiveDirectory is not prefixed by the name of the storage
                // (in the Simulator, or with FxOs 1.0, or probably on devices that only have one device storage)
                // In this case, we use the first storage of the list (there should be only one)
                if (zimArchiveLoader.storages.length === 1) {
                    selectedStorage = zimArchiveLoader.storages[0];
                }
                else {
                    alert("Something weird happened with the DeviceStorage API : found a directory without prefix : "
                        + archiveDirectory + ", but there were " + zimArchiveLoader.storages.length
                        + " storages found with getDeviceStorages instead of 1");
                }
            }
            selectedArchive = zimArchiveLoader.loadArchiveFromDeviceStorage(selectedStorage, archiveDirectory, function (archive) {
                cookies.setItem("lastSelectedArchive", archiveDirectory, Infinity);
                // The archive is set : go back to home page to start searching
                $("#btnHome").click();
            });
        }
    }

    // Called when archive is selected via FileSelector
    function setLocalArchiveFromFileList(files) {
        // Reset the cssDirEntryCache and cssBlobCache. Must be done when archive changes.
        if(cssBlobCache) 
            cssBlobCache = new Map();
        if(cssDirEntryCache) 
            cssDirEntryCache = new Map();
        selectedArchive = zimArchiveLoader.loadArchiveFromFiles(files, function (archive) {
            // The archive is set : go back to home page to start searching
            ui.archiveStatusUpdate(archive);
            $("#btnHome").click();
        });
    }

    /* Sets the localArchive from the File selects populated by user TODO: can be merged with setLocalArchiveFromFileList 
     */
    function setLocalArchiveFromFileSelect() {
        // if firefox is started in xhrff mode loading archive from url and then user switches to archive via fileselector, change the mode to file 
        // for readslice to use the right mode. This is because init.js won't get reloaded in this case. 
        if(READ_MODE !== "file"){
            READ_MODE = "file";
            require({'baseUrl':'js/lib'},['util'], (u) => {u.readSlice = u.readFileSlice;});
        }
        setLocalArchiveFromFileList(document.getElementById('archiveFiles').files);
    }

    /**
     * This is used in the testing interface to inject a remote archive.
     */
    window.setRemoteArchive = function(url) {
        var request = new XMLHttpRequest();
        request.open("GET", url, true);
        request.responseType = "blob";
        request.onreadystatechange = function () {
            if (request.readyState === XMLHttpRequest.DONE) {
                if ((request.status >= 200 && request.status < 300) || request.status === 0) {
                    // Hack to make this look similar to a file
                    request.response.name = url;
                    setLocalArchiveFromFileList([request.response]);
                }
            }
        };
        request.send(null);
    };

    // snippetController - Controls rate of additions of snippets
    // Not really required if upto < 10-20 with loadmore enabled on Desktop 
    // Is handy when upto is set higher, as an async article read happens for each result  
    // TODO: Controller is optional. 
    var snippetController;  
    function fillResult(dirEntry){         
        var snip_id = dirEntry.redirect ? dirEntry.redirectTarget : dirEntry.cluster+"_"+dirEntry.blob;
        var deToString = dirEntry.offset + '|' + dirEntry.mimetype + '|' + dirEntry.namespace + '|' + dirEntry.cluster + '|' +dirEntry.blob + '|' + dirEntry.url + '|' + dirEntry.title + '|' + dirEntry.redirect + '|' + dirEntry.redirectTarget;
        var articleListDivHtml = "<a href='#' dirEntryId='" 
        + deToString.replace(/'/g,"&apos;")
        + "' class='list-group-item' style='padding:2px'>" + dirEntry.title; 
        if(dirEntry.namespace !== "A")
            articleListDivHtml = articleListDivHtml + "<strong style='color:green;'>" +dirEntry.namespace+" "+ dirEntry.url+" </strong>";
        if (dirEntry.hasOwnProperty("redirectedFrom")){
            articleListDivHtml = articleListDivHtml + "<small style='color:red;'>("+dirEntry.redirectedFrom+")</small>"+"<strong style='color:blue;'> .. </strong><span class='small' id='"+ snip_id + "'></span></a>";       
        }else{
            articleListDivHtml = articleListDivHtml + "<strong style='color:blue;'> .. </strong><span class='small' id='"+ snip_id + "'></span></a>";
        }
        $('#articleList').append(articleListDivHtml);
        if (settings.includeSnippet && snippetController)
            snippetController.processORAddToQueue(dirEntry);
    }

    var articleReadController;
    function fillImages(dirEntry){         
        return new Promise(function (resolve, reject){
            if (dirEntry.namespace !== "A"){
                console.log("WARNING: Skipping Non-Article returned by finder:" + dirEntry.namespace, dirEntry.url);
                nonArticlesMatchedProcessed++;
                // TODO: Should this be before or after the resolve?
                if(totalFound == articlesMatchedProcessed + nonArticlesMatchedProcessed)
                    searchDone();
                resolve();
            }else{
                selectedArchive._file.blob(dirEntry.cluster, dirEntry.blob).then(function(data){
                    var htmlArticle = utf8.parse(data);
                    displayImagesInFrame(dirEntry, htmlArticle);
                    resolve();
                });
            }
        });
    }

    /**
     * Encapsulates a call to finder which starts workers that perform a binary search over the title index
     * The searchContext sets up the search
     */
    var totalFound, totalImages, articlesMatchedProcessed, nonArticlesMatchedProcessed, ResultSet, variantMatches=[]; 
    function search() {
        if(searchContext.loadmore){
            ui.reset();
            searchInit();
        }else{
            variantMatches=[];    
        }
        ui.status("Searching...", "btn-warning");
        
        // If incremental UI update of results is not desired move this inside onAllResults
        $('#articleList').show();
        if (selectedArchive !== null && selectedArchive.isReady()) {
            if (settings.includeSnippet)
                snippetController = new control.asyncJobQueue(settings.maxAsyncSnippetReads, fillSnippet);
            // if searchContext.caseSensitive = false setting the onAllResults callback is unnecessary
            new finder.titleSearch(searchContext, 
                            { onEachResult: fillResult, 
                              onAllResults: function (variant, matchCount, from){
                                variantMatches.push([variant, matchCount, from]);
                              },
                              onAllWorkersCompletion: titleSearchDone 
                            }, selectedArchive, READ_MODE);
        } else {
            // We have to remove the focus from the search field,
            // so that the keyboard does not stay above the message
            $("#searchArticles").focus();
            //alert("Archive not set : please select an archive");
            //ui.status("Archive not set!");
            $("#btnConfigure").click();
        }
    }
    
    window.getSearchResults = function getSearchResults(){
        return ResultSet;
    }
    // This is only required to add the 'fillImages of nextDirEnt' job into the controller queue 
    function processArticleForImages(dirEntry){
        totalFound++;
        articleReadController.processORAddToQueue(dirEntry);
    }

    function searchInit(){
        ResultSet = new Map();
        totalFound = 0;
        totalImages = 0;
        articlesMatchedProcessed = 0;
        nonArticlesMatchedProcessed = 0;
        variantMatches = [];
    }
    // TODO Remove Overlaps 
    function singleVariantDone(variant, matchCount, continueFromIndex){
        //$("#articleList a").on("click",handleTitleClick);
        variantMatches.push([variant, matchCount, continueFromIndex]);
        // It's possible processing of articles completes before the above code runs so recheck.
        // eg: wikivoyage keyword = "" 
        if(totalFound == articlesMatchedProcessed + nonArticlesMatchedProcessed)
            searchDone();
        //totalFound = totalFound + matchCount;
    }

    function updateSearchContext(){
        if(searchContext.caseSensitive){
            variantMatches.forEach((obj, i) => console.log(obj));
            var variantWithMostMatches = variantMatches.sort((a,b) => a[1]<b[1])[0];
            searchContext.keyword = variantWithMostMatches[0];
            searchContext.from = variantWithMostMatches[2];
            $("#from").val(searchContext.from);
        }
        searchContext.loadmore = true;        
    }

    // BUG: end of search condition can cause searchDone to get called multiple times and before it actually done. Fix: Make displayImagesInFrame promise based.
    function searchDone(){
        // TODO Is this the right way of updating the button and its handler?
        // for titlesearch - updateLoadMoreButton("Found:" +totalCount+ " Load More...");
        //var totImgCount from ResultSet
        ui.statusLoadMore("Pages:"+ totalFound+" Uniq:"+ResultSet.size + " Images:"+totalImages, "btn-success");
        // ResultSet.forEach((v,k) =>{ console.log(k); console.log(v.images.length, v.redirectedFrom, v.dup);})
        updateSearchContext();
        $("#loadmore").on('click', function(e) {
            pushBrowserHistoryState(null, null, searchContext.keyword);            
            $("#prefix").val(searchContext.keyword);
            $("title").html("ImageKeyword:"+ searchContext.keyword +" FromIndex:"+ searchContext.from);
            searchForImages();
        });
        console.timeEnd("ImageSearch Lookup+Inject+Load");
    }

    function titleSearchDone(allResults){
        $("#articleList a").on("click",handleTitleClick);
        updateSearchContext();
        if(allResults.length == 0){
            ui.status("Nothing Matched!");
            return;    
        }
        ui.statusLoadMore("Found:" +allResults.length+ " Load More...");
        $("#loadmore").on('click', function(e) {
            pushBrowserHistoryState(null, searchContext);
            $("#prefix").val(searchContext.keyword);
            $("title").html("Keyword:"+ searchContext.keyword +" FromIndex:"+ searchContext.from);
            search();
        });
        // $("#articleContent").contents().scrollTop($("#articleList:last-child").offset().top);        
    }

    function searchForImages() {
        console.time("ImageSearch Lookup+Inject+Load");
        if(!searchContext.loadmore){
            ui.reset();
            $("#articleContent").attr('src', "A/imageResults.html");
            searchInit();            
        }else{
            variantMatches=[];
        }
        //$("#articleContent").contents().scrollTop(0);            
        /* TODO Show Progress */
        ui.status("Searching...", "btn-warning")
        //var keyword = decodeURIComponent(prefix); 
        if (selectedArchive !== null && selectedArchive.isReady()) {
            // used in processArticleForImages TODO refactor
            articleReadController = new control.asyncJobQueue(settings.maxAsyncArticleReads, fillImages);
            var f = new finder.titleSearch(searchContext, {
                onEachResult: processArticleForImages,
                // NOTE: this just means title index lookup is done for one variant not UI update completion
                onAllResults: singleVariantDone
                // onAllWorkerTODO: use to improve searchDone detection promise.all( all dislayinFrame resolved promises)
            }, selectedArchive, READ_MODE);
        } else {
            // We have to remove the focus from the search field,
            // so that the keyboard does not stay above the message
            $("#searchArticles").focus();
            //ui.status("Archive not set!");
            $("#btnConfigure").click();
        }
    }

    // TODO: Handle multiple results resolving to the same snip_id
    // Overlaps with how image search handles dups and resolves - can be generalized
    // NOTE: fillSnippet had to be move into this fn because controller is used within it.
    // One way to keep it seperate is if the job (ie fillSnippet) on resolve indicates do more work
    // A thanable would be used to check this and call processORaddtoqueue
    // TODO: With worker now handling redirects, doing it here again seems unnecessary. Decide where it should be done long term.
    function fillSnippet(dirEntry) {
        return new Promise(function(resolve, reject){
            // This will be undefined_undefined if de is a redirect
            // Need to be updated on resolve
            var snip_id = dirEntry.cluster + "_"+ dirEntry.blob;
            if (dirEntry.redirect) {
                //console.log("REDIRECT "+ snip_id + " "+ dirEntry.title);
                var tmp_snip = dirEntry.redirectTarget;
                selectedArchive.resolveRedirect(dirEntry, function(de){
                    // On resolving de, update the snip_id in HTML
                    $("#"+tmp_snip).attr("id", de.cluster + "_" + de.blob);
                    controller.processORAddToQueue(de);
                    resolve();
                });
            } else {
                    selectedArchive._file.blob(dirEntry.cluster, dirEntry.blob).then(function(data){
                    // var top = $(data); <== gives the best snips tho for wikipedia zims. 
                    // TODO: Issue here is, when infoboxes are present first para 
                    // can get pushed way down into the article
                    // console.time(title);
                    data = utf8.parse(data);
                    var b = data.search(/<body/); 
                    var top = data.slice(b, b+4000);
                    // get rid of 404s
                    top = top.replace("src=","nosrc=");
                    var snippet = new ui.snippet($(top).find("p")).parse();
                    /* Testing jaifroid's regex
                    var firstpara = /((?:<span\s*>\s*)?<p\b[^>]*>(?:(?=([^<]+))\3|<(?!p\b[^>]*>))*?<\/p>(?:<span\s*>)?)/i ;
                    var snippet = top.match(firstpara);
                    if (snippet)
                        snippet = snippet[0].slice(0, 500);
                    */
                    $("#"+snip_id).html(snippet + "...");
                    //console.timeEnd(title);
                    resolve();
                });
            }
        });
    }
  
    /**
     * Handles the click on the title of an article in search results
     * @param {Event} event
     * @returns {Boolean}
     */
    function handleTitleClick(event) {
        // TODO: Can be refactored/reused? url->DirEnt step gets skipped by saving dirent in search result link        
        var dirEntryId = event.currentTarget.getAttribute("dirEntryId");
        ui.reset();
        findDirEntryFromDirEntryIdAndLaunchArticleRead(dirEntryId);
        var dirEntry = selectedArchive.parseDirEntryId(dirEntryId);
        pushBrowserHistoryState(dirEntry.url);
        return false;
    }
    
    /**
     * Creates an instance of DirEntry from given dirEntryId (including resolving redirects),
     * and call the function to read the corresponding article
     * @param {String} dirEntryId
     */
    function findDirEntryFromDirEntryIdAndLaunchArticleRead(dirEntryId) {
        if (selectedArchive.isReady()) {
            var dirEntry = selectedArchive.parseDirEntryId(dirEntryId);
            $("title").html(dirEntry.title);
            ui.status("Reading...", "bg-warning");
            //$("#articleContent").contents().html("");
            if (dirEntry.isRedirect()) {
                selectedArchive.resolveRedirect(dirEntry, readArticle);
            }
            else {
                readArticle(dirEntry);
            }
        }
        else {
            alert("Data files not set");
        }
    }

    /**
     * Read the article corresponding to the given dirEntry
     * @param {DirEntry} dirEntry
     */
    function readArticle(dirEntry) {
        if (dirEntry.isRedirect()) {
            selectedArchive.resolveRedirect(dirEntry, readArticle);
        }
        else {
            //console.log(dirEntry);
            selectedArchive.readArticle(dirEntry, displayArticleInFrame);
        }
    }

    function applyCSS(link, content) 
    {
        var cssContent = util.uintToString(content);
        // For some reason, Firefox OS does not accept the syntax <link rel="stylesheet" href="data:text/css,...">
        // So we replace the tag with a <style type="text/css">...</style>
        // while copying some attributes of the original tag
        // Cf http://jonraasch.com/blog/javascript-style-node
        var cssElement = document.createElement('style');
        cssElement.type = 'text/css';

        if (cssElement.styleSheet) {
            cssElement.styleSheet.cssText = cssContent;
        } else {
            cssElement.appendChild(document.createTextNode(cssContent));
        }
        var mediaAttributeValue = link.attr('media');
        if (mediaAttributeValue) {
            cssElement.media = mediaAttributeValue;
        }
        var disabledAttributeValue = link.attr('media');
        if (disabledAttributeValue) {
            cssElement.disabled = disabledAttributeValue;
        }
        link.replaceWith(cssElement);
        // console.timeEnd("css-load");
        // Returns a promise in case some loading op is waiting for CSS load complete
        return Promise.resolve();
    }

    /* Relaces link pointing to a css stylesheet with a style tag containing css blob from ZIM file
     * @param {jQueryNode} link tag 
     * @param {String} link tag's href attribute
     */
    function loadCSS(link, hrefURL){
        //console.time("css-load");
        // It's a CSS file contained in the ZIM file
        var url = ui.removeUrlParameters(decodeURIComponent(hrefURL));
        var cssLoadingPromise;
        if(cssBlobCache && cssBlobCache.has(url)){
            //console.log("blob hit");
            cssLoadingPromise = Promise.resolve().then(() => applyCSS(link, cssBlobCache.get(url)));            
        }else{
            cssLoadingPromise = selectedArchive.getDirEntryByURL(url, cssDirEntryCache)
            .then(function(dirEntry) 
            {
                // promise reolved on readData completion is passed back to cssLoadingPromise
                return selectedArchive.readBinaryFile(dirEntry, function (content){
                    applyCSS(link, content);
                    if(cssBlobCache)
                        cssBlobCache.set(url, content); 
                });
            }).catch(function (e) {
                console.error("could not find DirEntry for CSS : " + url, e);
            });
        }
        cssLoaded.push(cssLoadingPromise);
        //console.log("added css promise");    
    }

    function checkTypeAndInject(url, jQueryNode, imageBlob) {
        if(util.endsWith(url, ".png")){
            ui.feedNodeWithBlob(jQueryNode, 'src', imageBlob, 'image/png');
        }else if (util.endsWith(url, ".svg")){
            ui.feedNodeWithBlob(jQueryNode, 'src', imageBlob, 'image/svg+xml;');
        }else if (util.endsWith(url, ".jpg")){
            ui.feedNodeWithBlob(jQueryNode, 'src', imageBlob, 'image/jpeg');
        }else{
            //console.error("Unrecognized image format: " + dirEntry.url);
            ui.feedNodeWithBlob(jQueryNode, 'src', imageBlob, 'image');
        }
    }

    function existsInKnownArchives(url){
        var temp = new URL(url);
        //console.log(temp);
        if(!library.URL2Archive.hasOwnProperty(temp.hostname))
            return false; 
        var parts = temp.pathname.split('/');
        // This code handles cases where hostname + a bit of the path maps to an archive
        // eg en.wikipedia.org/wiki/ or en.wiktionary.org/wiki/ 
        const cnt = parts.length;
        if ( cnt == 1)
            return false;
        for(var i=0;i<cnt;i++){
            var basePath = parts.slice(0, i).join('/');
            //console.log(basePath);
            if(library.URL2Archive.hasOwnProperty(temp.host + basePath )){
                var archive = library.URL2Archive[temp.host + basePath];
                // TODO assumption here is parts[cnt-1] refers to title, not so in SO zims eg: questions/id/title 
                if (archive == "so" && parts[1] == "questions")
                        return {'archive':archive,'title':"question/" + parts[2] + ".html",'url':"./../index.html?archive=" + archive + "&title=question/" + parts[2] + ".html"};
                return {'archive':archive, 'title':parts[cnt-1].replace(/%20/g,"_") + ".html" ,'url':"./../index.html?archive=" + archive + "&title=" + parts[cnt-1].replace(/%20/g,"_") + ".html"};
            }
        }
        return false; 
    }

    function fixLink() {
        // Store current link's url
        var url = $(this).attr("href");
        if (url === null || url === undefined) {
            return;
        }
        var lowerCaseUrl = url.toLowerCase();
        var cssClass = $(this).attr("class");

        if (cssClass === "new") {
            // It's a link to a missing article : display a message
            $(this).on('click', function(e) {
                ui.status("Missing article");
                return false;
            });
        }else if (url.slice(0, 1) === "#") {
            // It's an anchor link : do nothing TODO: Add to TOC
        }else if (url.substring(0, 4) === "http") {
            // It's an external link : open in a new tab
            var result = existsInKnownArchives(url);
            if(!result)
                $(this).attr("target", "_blank");
            else{
                // if hostname belongs to a known archive [2 cases] 
                // when link is clicked new page injected of archive already loaded  
                // or new archive needs to be loaded 
                //console.log(result.archive, params['archive'], url);
                if (result.archive == selectedArchive._file._files[0].name){
                    $(this).on('click', function(e) {
                        var decodedURL = decodeURIComponent(result.title);
                        pushBrowserHistoryState(decodedURL);
                        goToArticle(decodedURL);
                    });
                }else{
                    // In case archive is a diff archive archive obj has to be reloaded
                    $(this).on('click', function(e) {
                        //ui.reset();    
                        selectedArchive = zimArchiveLoader.loadArchiveFromURL(result.archive);
                        //ui.archiveStatusUpdate(selectedArchive);
                        var decodedURL = decodeURIComponent(result.title);
                        pushBrowserHistoryState(decodedURL);
                        goToArticle(decodedURL);
                    });                   
                } 
                // When opened in new tab/window, new/existing archive name must be injected into url for it to work
                // In this case click handler doesn't run.
                $(this).attr("href", location.href.replace( /[\?#].*|$/, "?archive="+result.archive+"&title="+result.title));  
            }
        }else if (url.substring(0, 4) === "geo:") {
            let coords = url.substring(4).split(',');
            let title = window.location.search.match(/title=([^&]*)\.html/)[1];
            //TODO: conform to abnf - https://docs.microsoft.com/en-us/windows/uwp/launch-resume/launch-maps-app#bingmaps-parameter-reference
            coords[0] = coords[0].substring(0,10); // temp hack
            coords[1] = coords[1].substring(0,10); // temp hack
            $(this).attr("href", "bingmaps:?collection=point." + coords[0] + "_" + coords[1]+"_" + title);
            //console.debug("bingmaps:?collection=point." + coords[0] + "_" + coords[1]+"_" + title);
        }else if (url.match(regexpImageLink)
            && (util.endsWith(lowerCaseUrl, ".png")
                || util.endsWith(lowerCaseUrl, ".svg")
                || util.endsWith(lowerCaseUrl, ".jpg")
                || util.endsWith(lowerCaseUrl, ".jpeg"))) {
            // It's a link to a file of Wikipedia : change the URL to the online version and open in a new tab
            var onlineWikipediaUrl = url.replace(regexpImageLink, "https://" + selectedArchive._language + ".wikipedia.org/wiki/File:$1");
            $(this).attr("href", onlineWikipediaUrl);
            $(this).attr("target", "_blank");
        }
        else {
            // It's a link to another article
            // Add an onclick event to go to this article
            // instead of following the link
            if (url.substring(0, 2) === "./") {
                url = url.substring(2);
            }else if (url.substring(0, 1) === "/"){
                url = url.substring(1);
            }else if ( url.substring(0, 6) === "../../"){ // handles some stackoverflow links 
                url = url.substring(6);
            }
            else if (url.substring(0, 3) === "../") {
                url = url.substring(3);
            }
            $(this).on('click', function(e) {
                var decodedURL = decodeURIComponent(url);
                pushBrowserHistoryState(decodedURL);
                goToArticle(decodedURL);
                return false;
            });
             
            // For new tab to work inject archive name into link
            $(this).attr('href', location.href.replace( /[\?#].*|$/, "?archive="+selectedArchive._file._files[0].name+"&title="+url));
            $(this).attr("target", "_blank");
        }
    }

    function getImageUrls(imgNodes){
        var urls = [];
        for(var k=0;k<imgNodes.length;k++){
            var imgurl = imgNodes[k].getAttribute('data-src');
            var m = imgurl.match(regexpImageUrl);
            if(m)
                urls.push(decodeURIComponent(m[1]));
            else
                console.error("Unrecognized image URL! Not retrieving - "+imgurl); 
        }
        return urls;        
    }

    async function loadVid(vidNode){
        console.log(vidNode);
        var sourceNode = $($(vidNode).find('source')[0]);
        var vidurl = sourceNode.attr('src');
        // removes rel url part ../../ etc vids in ted talks, url look like I/123.mp4
        var v = vidurl.match(regexpImageUrl);
        if(v)
            v=decodeURIComponent(v[1]);
        else{
            console.error("Unrecognized vid URL! Not retrieving - "+vidurl); 
            return;
        }
        console.log('loading '+v);

        var direntry = await selectedArchive.getDirEntryByURL(v);
        var viddata = await direntry.readData();
        var blob = new Blob([viddata], {type: 'video'});
        var url = URL.createObjectURL(blob);
        
        var trackNode = $(vidNode).find('track[srclang="en"]')[0];
        var suburl = trackNode.getAttribute('src');
        console.log(suburl);
        var s = suburl.match(regexpMetadataUrl);
        if(s)
            suburl=decodeURIComponent(s[1]);
        else{
            console.error("Unrecognized vid URL! Not retrieving - "+s); 
            return;
        }
        console.log('loading '+suburl);

        var subsdirentry = await selectedArchive.getDirEntryByURL(suburl);
        var subsdata = await subsdirentry.readData();
        var subsblob = new Blob([subsdata], {type:'text/vtt'});
        var subs = URL.createObjectURL(subsblob); 
        sourceNode.attr('src', url);
        $(vidNode).append('<track src="'+subs+'" default kind="subtitles" srclang="en" label="English">');
        //console.log(vidNode.textTracks.length);
        vidNode.textTracks[vidNode.textTracks.length-1].mode = "showing";
        $(vidNode).load();
    }
    /**
     * Display the the given HTML article in the web page,
     * and convert links to javascript calls
     * NB : in some error cases, the given title can be null, and the htmlArticle contains the error message
     * @param {String} title [BUG] should be dirent
     * @param {String} htmlArticle
     */
    async function displayArticleInFrame(title, htmlArticle) {
        // Scroll the iframe to its top
        $("#articleContent").contents().scrollTop(0);
        // BUG: handle cases where src is a non zim url or a data url
        htmlArticle = htmlArticle.replace(/(<img\s+[^>]*\b)src(\s*=)/ig, "$1data-src$2");
        //htmlArticle = htmlArticle.replace(/preload="auto"/, "");
        //htmlArticle = htmlArticle.replace(/<track.*>/ig,"");
        var iframe = document.getElementById('articleContent');
        var innerDoc = iframe.contentDocument || iframe.contentWindow.document;
        var $iframe = $('#articleContent').contents();
        // NOTE:keepScripts set to false so no js 404's but change to true to if reqd
        var $body = $.parseHTML(htmlArticle, innerDoc ,false);
        // To get links - $body.filter((j) => { return j.nodeName == "LINK"})
        var $iframeBody = $iframe.find('body');
        $iframeBody.html($body);
       
        if (contentInjectionMode === 'ParseAndLoad') {
            // Convert links into javascript calls
            $iframeBody.find('a').each(fixLink);

            // Load images
            var imageLoadCompletions = [];
            var imgNodes = $iframeBody.find('img');
            var vidNodes = $iframeBody.find('video');
            // Refer #278 & #297 - For math heavy page use the controller - TEMP Solution till ZIM files support mathjax
            // No need for the controller otherwise. Alternately use local mathjax see SO - q/31891619
            var svgmathload = imgNodes.filter(".mwe-math-fallback-image-inline").length;
            var controller, controlledLoading = svgmathload/imgNodes.length > 0.5 ? true : false;
            //console.log("SVG Math Load:"+ (svgmathload/imgNodes.length)*100);
            if(imgNodes.length > 0)
            {
                //console.log(imgNodes);
                var imageURLs = getImageUrls(imgNodes);
                console.time("Total Image Lookup+Read+Inject Time");
                console.time("TimeToFirstPaint");

                var injectImage = function (index, dirEntry){
                    if (!dirEntry) return Promise.resolve(null);
                    return selectedArchive._file.blob(dirEntry.cluster, dirEntry.blob)
                        .then((imageBlob) => checkTypeAndInject(dirEntry.url.toLowerCase(), $(imgNodes[index]), imageBlob))
                        .catch((reason) => {
                            console.log(reason);
                            console.error("Failed loading " + dirEntry.url );
                        });
                }

                if(controlledLoading)
                    // The number of async injectImage that will run at a time is controlled by maxAsyncImageReads 
                    controller = new control.asyncJobQueue(settings.maxAsyncImageReads, injectImage);
                // finder divides the url list among workers, callbacks handle finder "events"
                var f = new finder.urlSearch(imageURLs, {
                    onEachResult: function(index, dirEntry){
                        var p;
                        if(controlledLoading)
                            p = controller.processORAddToQueue(index, dirEntry);
                        else
                            p = injectImage(index, dirEntry); 
                        imageLoadCompletions.push(p);
                    },
                    onFirstWorkerCompletion: function(){
                        // initialImageLoad in 'quick' mode complete
                        // NOTE: any waiting that is done here will hold up all other worker starts
                        return Promise.all(cssLoaded).then(()=>{console.timeEnd("TimeToFirstPaint");});
                    }, 
                    onAllWorkersCompletion: function(resultsCount){
                        Promise.all(imageLoadCompletions).then(function (){
                            ui.status("Article Load Complete!"+" Images Loaded! Image Count:" + resultsCount );
                            console.timeEnd("Total Image Lookup+Read+Inject Time");
                        });
                    }
                }, selectedArchive, READ_MODE, settings.workerCount);
                f.run({type:"quick", initialImageLoad: settings.initialImageLoad});
            }
            if (vidNodes.length > 0){
                // TED pages usually have only 1 vid so this just temo till code stabilizes
                loadVid(vidNodes[0]);
            }

            // Load CSS content
            // initialize the promise array
            cssLoaded = [];
            $iframeBody.find('link[rel=stylesheet]').each(function() {
                var link = $(this);
                // We try to find its name (from an absolute or relative URL)
                var hrefMatch = link.attr("href").match(regexpMetadataUrl);
                if (hrefMatch) {
                    loadCSS(link, hrefMatch[1]);
                }
            });
            Promise.all(cssLoaded).then(()=>{ui.status("Article Load Complete!")});
            //console.log("# of css files loading:" + cssLoaded.length);
            //ui.setupTableOfContents(innerDoc);    
        }
    }

    function displayImagesInFrame(dirEntry, htmlArticle) {
        if(!dirEntry && !htmlArticle){
            ui.status("No matches found", "btn-success");
            console.log("FIX: add errorcnt to searchDone check");
            // TODO errorcount++; add to searchDone condition 
            return;
        }
        // for use inside callbacks
        var foundDirEntry = dirEntry;
        if (ResultSet.has(dirEntry.title)){
            var result = ResultSet.get(dirEntry.title);
            result.dup = true;
            result.redirectedFrom = dirEntry.redirectedFrom;
            ResultSet.set(dirEntry.title, result);
            console.log(dirEntry.title + " already processed, skipping...");
            articlesMatchedProcessed++;
            if(totalFound == articlesMatchedProcessed + nonArticlesMatchedProcessed)
                searchDone();
            return;
        }

        // TODO: Not required as its not going to be set to frame src
        htmlArticle = htmlArticle.replace(/(<img\s+[^>]*\b)src(\s*=)/ig, "$1data-src$2");
        var $body = $(htmlArticle);
        var imgNodes = $body.contents().find('img').filter(function(index){
            return $(this).attr('width') > 50
        } );//$('#articleContent img');
        if(imgNodes.length==0)
        {
            ui.status(foundDirEntry.title +" no images found");
            ResultSet.set(foundDirEntry.title, {images:[],redirectedFrom:foundDirEntry.redirectedFrom, dup:""});
            articlesMatchedProcessed++;
            if(totalFound == articlesMatchedProcessed + nonArticlesMatchedProcessed)
                searchDone();
            return;
        }
        //var snippet = new ui.snippet($body.contents().find("p")).parse();
        var imageURLs = [].slice.call(imgNodes)
                           .map(el => decodeURIComponent(el.getAttribute('data-src')
                                        .match(regexpImageUrl)[1]));
        if(imageURLs.length > 0){
            console.time(foundDirEntry.title+" "+imageURLs.length+" Image Lookup+Read+Inject Time");
            ResultSet.set(foundDirEntry.title, {images:imageURLs, redirectedFrom:foundDirEntry.redirectedFrom, dup:""});
        }
        var imageLoadCompletions = [];
        var f = new finder.urlSearch(imageURLs, {
                onEachResult: function(index, dirEntry){
                    var p = selectedArchive._file.blob(dirEntry.cluster, dirEntry.blob);
                    p.then(function (content) {
                        // TODO lowercase bs push into checkType..
                        checkTypeAndInject(dirEntry.url.toLowerCase(), $(imgNodes[index]), content)
                        var wrapper = $('<span>', {class:"grid-item"});
                        // TODO consolidate click handlers
                        wrapper.on('click', function(e) {
                                var decodedURL = decodeURIComponent(foundDirEntry.url);
                                pushBrowserHistoryState(decodedURL);
                                goToArticle(decodedURL);
                                return false;
                        });
                        $("#articleContent").contents().find('.grid').append(
                                wrapper.append($(imgNodes[index])));
                        //console.log("img added "+foundDirEntry.offset+" "+ dirEntry.url);
                        //statusUpdate("Found pages:" + ResultSet.size + " images:"+imageLoadCompletions.length, "btn-info");
                    },function (){
                        console.error("Failed loading " + dirEntry.url );
                    }).then(() => Promise.resolve());
                    imageLoadCompletions.push(p);
                }, 
                /* Adding Image Snippet Test
                onFirstWorkerCompletion: function(){
                    $("#articleContent").contents().find('.grid').append("<p>"+snippet+"</p>");
                },*/
                onAllWorkersCompletion: function(resultsCount){
                    Promise.all(imageLoadCompletions).then(function (){
                        totalImages = totalImages + imageLoadCompletions.length;
                        console.timeEnd(foundDirEntry.title + " "+resultsCount+" Image Lookup+Read+Inject Time");
                        articlesMatchedProcessed++;
                        console.log(totalFound, articlesMatchedProcessed, nonArticlesMatchedProcessed);
                        ui.status("Images Found:"+totalFound);
                        if(totalFound == articlesMatchedProcessed + nonArticlesMatchedProcessed)
                            searchDone(); 
                    });
                }
            }, selectedArchive, READ_MODE, settings.workerCount 
        );
        f.run();
    }

    /**
     * Changes the URL of the browser page, so that the user might go back to it
     * 
     * @param {String} title
     * @param {String} titleSearch
     */
    function pushBrowserHistoryState(title, titleSearch, imageSearch) {
        var stateObj = {};
        var urlParameters;
        var stateLabel;
        // This will ensure in url mode (as opposed to file selector mode) archive parameter becomes part of the url string. 
        // Bookmarking links & Setting home page to a url will also be possible.
        var appendArchive = READ_MODE == "file" ? "" : "&archive="+ selectedArchive._file._files[0].name;

        if (title && !(""===title)) {
            stateObj.title = title;
            urlParameters = "?title=" + title + appendArchive;
            stateLabel = "Article : " + title;
        }
        else if (titleSearch) {
            stateObj.titleSearch = titleSearch;
            urlParameters = "?titleSearch=" + titleSearch.keyword + "&from=" + titleSearch.from +"&upto=" + titleSearch.upto + "&match=" + titleSearch.match + appendArchive;
            stateLabel = "Keyword search : " + titleSearch.keyword;
        }
        else if (imageSearch && !(""===imageSearch)) {
            stateObj.imageSearch = imageSearch;
            urlParameters = "?imageSearch=" + imageSearch + appendArchive;
            stateLabel = "Image search : " + imageSearch;
        }
        else {
            return;
        }
        window.history.pushState(stateObj, stateLabel, urlParameters);
    }

    // common code used by gotoArticle/gotoMainArticle/gotoRandomArticle
    function injectContent(dirEntry){
        $("title").html(dirEntry.title);
        ui.status("Reading...", "bg-danger");
        $('#articleContent').contents().find('body').html("");
        readArticle(dirEntry);
    }

    /**
     * Replace article content with the one of the given url
     * @param {String} article url eg: Paris.html
     */
    function goToArticle(url) {
        url = "A/" + url; 
        selectedArchive.getDirEntryByURL(url).then(function(dirEntry) {
            if (dirEntry === null || dirEntry === undefined) {
                //alert("Article with url " + url + " not found in the archive");
                ui.status("Article Not Found:"+ url);
            }
            else {
                injectContent(dirEntry);
            }
        }).catch(function() { 
            //alert("Error reading article with title " + url);
            ui.status("Error Reading " + url); 
        });
    }
    
    function goToRandomArticle() {
        if (selectedArchive !== null && selectedArchive.isReady()) {    
            selectedArchive.getRandomDirEntry(function(dirEntry) {
                if (dirEntry === null || dirEntry === undefined) {
                    ui.status("Error Finding Random Article.");
                }
                else {
                    if (dirEntry.namespace === 'A') {
                        pushBrowserHistoryState(dirEntry.url);
                        injectContent(dirEntry);
                    }
                    else {
                        // If the random title search did not end up on an article,
                        // we try again, until we find one
                        goToRandomArticle();
                    }
                }
            });            
        } else {
            //$('#searchingForArticles').hide();
            // We have to remove the focus from the search field,
            // so that the keyboard does not stay above the message
            $("#searchArticles").focus();
            ui.status("Archive Not Set!");
            $("#btnConfigure").click();
        }
    }

    function goToMainArticle() {
        //ui.reset();
        if (selectedArchive && selectedArchive.isReady()){
            selectedArchive.getMainPageDirEntry(function(dirEntry) {
                if (dirEntry === null || dirEntry === undefined) {
                    ui.status("Error finding main article.");
                    console.error("Error finding main article.");
                }
                else {
                    if (dirEntry.namespace === 'A') {
                        pushBrowserHistoryState(dirEntry.url);
                        injectContent(dirEntry);
                    }
                    else {
                        ui.status("The main page of this archive does not seem to be an article");
                        console.error("The main page of this archive does not seem to be an article");
                    }
                }
            });            
        }else{
            ui.status("Archive Not Set!", 'bg-danger');
        }
    }

    // Converts selectedArchive object to string. The string can be saved and used later to recreate the object  
    // eg: on console > var a;require({baseUrl:'js/lib'},['../app'], function(z){a=z.stringifyArchive()});console.log(a);
    function stringifyArchive(){
        if (selectedArchive !== null && selectedArchive.isReady()) {
            var filenames = []; 
            selectedArchive._file._files.forEach((c) => filenames.push({name:c.name, size:c.size})); 
            var f = JSON.stringify(selectedArchive._file); 
            var fp = JSON.parse(f); 
            fp._files = filenames; 
            return JSON.stringify({_file:fp, _language:""});                 
        }
        return "";
    }

    // Video test on ted_en_technology_2018-07.zim
    // after loading zim on devconsole run - var a;require({baseUrl:'js/lib'},['../app'], function(z){a=z.testVid('I/896/video.mp4','-/896/subs/subs_en.vtt')});
    async function testVid(vidurl, suburl){
        var url = decodeURIComponent(vidurl);
        //console.log(url); 
        var direntry = await selectedArchive.getDirEntryByURL(url);
        var viddata = await direntry.readData();
        var subsdirentry = await selectedArchive.getDirEntryByURL(suburl);
        var subsdata = await subsdirentry.readData();
        var blob = new Blob([viddata], {type: 'video'});
        var subsblob = new Blob([subsdata], {type: 'text/vtt'});
        var url = URL.createObjectURL(blob);
        var subs = URL.createObjectURL(subsblob);
        var vidhtml = $('<video controls src='+url+'></video>');
        vidhtml.append('<track src="'+subs+'" default kind="subtitles" srclang="en" label="English">');
        $('#articleContent').contents().find('body').html(vidhtml);
    }

    return { 
        stringifyArchive: stringifyArchive,
        testVid: testVid
    };
});
