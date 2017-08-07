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

define(['jquery', 'zimArchiveLoader', 'util', 'uiUtil', 'cookies','abstractFilesystemAccess', 'module'],
 function($, zimArchiveLoader, util, uiUtil, cookies, abstractFilesystemAccess, module) {
     
    // Disable any eval() call in jQuery : it's disabled by CSP in any packaged application
    // It happens on some wiktionary archives, because there is some javascript inside the html article
    // Cf http://forum.jquery.com/topic/jquery-ajax-disable-script-eval
    jQuery.globalEval = function(code) {
        // jQuery believes the javascript has been executed, but we did nothing
        // In any case, that would have been blocked by CSP for package applications
        console.log("jQuery tried to run some javascript with eval(), which is not allowed in packaged applications");
    };
    
    /**
     * Maximum number of articles to display in a search
     * @type Integer
     */
    var MAX_SEARCH_RESULT_SIZE = module.config().results;

    /**
     * @type ZIMArchive
     */
    var selectedArchive = null;
    
    /**
     * Resize the IFrame height, so that it fills the whole available height in the window
     */
    function resizeIFrame() {
        var height = $(window).outerHeight()
                - $("#top").outerHeight(true)
                //- $("#articleListWithHeader").outerHeight(true)
                // TODO : this 5 should be dynamically computed, and not hard-coded
                - $("#navigationButtons").outerHeight(true);
        $("#articleContent").css("height", height + "px");
    }
    $(document).ready(resizeIFrame);
    $(window).resize(resizeIFrame);
    
    function statusUpdate(text, type){
        if(type)
            $("#appStatus").removeClass().addClass(type).text(text);
        else
        {
            $("#appStatus").removeClass().addClass("bg-danger").text(text);
            //$('#appStatus').fadeTo(100, 0.3, function() { $(this).fadeTo(500, 1.0); });
        }    
    }

    function statusUpdateHTML(html){
        $("#appStatus").removeClass().html(html);
    }

    function archiveStatusUpdate(){
        var name = selectedArchive._file._files[0].name;
        if(name && name !=="undefined"){
            statusUpdate(selectedArchive._file._files[0].name, "bg-success");
        }else{
            statusUpdate("Archive not set!!", "btn-danger");
            // TODO: remove urlparams, goto config screen
            throw {name:"KiwixError", message:"Archive Undefined"};    
        }
    }

    function resetUI(){
        statusUpdate("");
        $('#about').hide();
        $('#configuration').hide();
        $("#welcomeText").hide();
        $('#articleList').hide();
        $("#articleList").empty();
        try{
            // .empty() doesnt seem to clear the frame
            $("#articleContent").contents().find("body").html('');   
        }catch(e){
            if(e.name === "SecurityError"){
                statusUpdate("ERROR: Set flag allow-file-access-from-files!!!", "btn-danger");
                throw "Error";
            }
        }
    }

    // Both search bar key presses and submit button press handled here.
    $('#searchArticles').on('click', function(e) {
        resetUI();
        pushBrowserHistoryState(null, $('#prefix').val());
        $("title").html($('#prefix').val());
        searchDirEntriesFromPrefix($('#prefix').val());
    });
    $('#searchImages').on('click', function(e) {
        pushBrowserHistoryState(null, null, $('#prefix').val());
        $("title").html($('#prefix').val());
        searchDirEntriesFromImagePrefix($('#prefix').val());
    });
    $('#formArticleSearch').on('submit', function(e) {
        document.getElementById("searchArticles").click();
        return false;
    });
    $('#prefix').on('keyup', function(e) {
        if (selectedArchive !== null && selectedArchive.isReady()) {
            onKeyUpPrefix(e);
        }
    });
    $("#btnRandomArticle").on("click", function(e) {
        if (selectedArchive !== null && selectedArchive.isReady()) {
            goToRandomArticle();
            resetUI();
            archiveStatusUpdate();
        } else {
            //$('#searchingForArticles').hide();
            // We have to remove the focus from the search field,
            // so that the keyboard does not stay above the message
            $("#searchArticles").focus();
            statusUpdate("Archive not set!");
            $("#btnConfigure").click();
        }        
    });
    
    $('#btnRescanDeviceStorage').on("click", function(e) {
        searchForArchivesInStorage();
    });
    // Bottom bar :
    $('#btnBack').on('click', function(e) {
        history.back();
        return false;
    });
    $('#btnForward').on('click', function(e) {
        history.forward();
        return false;
    });
    $('#btnHomeBottom').on('click', function(e) {
        $('#btnHome').click();
        return false;
    });
    $('#btnTop').on('click', function(e) {
        $("#articleContent").contents().scrollTop(0);
        // We return true, so that the link to #top is still triggered (useful in the About section)
        return true;
    });
    // Top menu :
    $('#btnHome').on('click', function(e) {
        // Highlight the selected section in the navbar
        /*$('#liHomeNav').attr("class","active");
        $('#liConfigureNav').attr("class","");
        $('#liAboutNav').attr("class","");
        if ($('#navbarToggle').is(":visible") && $('#liHomeNav').is(':visible')) {
            $('#navbarToggle').click();
        }*/
        // Show the selected content in the page
        resetUI();
        $('#formArticleSearch').show();
        $("#welcomeText").show();
        $('#articleList').show();
        // Give the focus to the search field, and clean up the page contents
        $("#prefix").val("");
        $('#prefix').focus();
        if (selectedArchive !== null && selectedArchive.isReady()) {
            $("#articleList").hide();
            $("#welcomeText").hide();
            goToMainArticle();
            archiveStatusUpdate();
        }
        return false;
    });
    $('#btnConfigure').on('click', function(e) {
        $("title").html("Kiwix");
        // Show the selected content in the page
        resetUI();
        $('#configuration').show();
        statusUpdate("");
        return false;
    });
    $('#btnAbout').on('click', function(e) {
        $("title").html("Kiwix");
        resetUI();
        $('#about').show();
        statusUpdate("");
        return false;
    });
    $('input:radio[name=contentInjectionMode]').on('change', function(e) {
        if (checkWarnServiceWorkerMode(this.value)) {
            // Do the necessary to enable or disable the Service Worker
            setContentInjectionMode(this.value);
        }
        else {
            setContentInjectionMode('jquery');
        }
    });
    /*$('input:checkbox[name=cssCacheMode]').on('change', function (e) {
        module.config().cssCache = this.checked ? true : false;
    });
    $('input:radio[name=cssInjectionMode]').on('change', function (e) {
        module.config().cssSource = this.value;
    });
    $(document).ready(function (e) {
        // Set checkbox for cssCache and radio for cssSource
        document.getElementById('cssCacheModeCheck').checked = module.config().cssCache;
    });*/
    
    /**
     * Displays or refreshes the API status shown to the user
     */
    function refreshAPIStatus() {
        if (isMessageChannelAvailable()) {
            $('#messageChannelStatus').html("MessageChannel API available");
            $('#messageChannelStatus').removeClass("apiAvailable apiUnavailable")
                    .addClass("apiAvailable");
        } else {
            $('#messageChannelStatus').html("MessageChannel API unavailable");
            $('#messageChannelStatus').removeClass("apiAvailable apiUnavailable")
                    .addClass("apiUnavailable");
        }
        if (isServiceWorkerAvailable()) {
            if (isServiceWorkerReady()) {
                $('#serviceWorkerStatus').html("ServiceWorker API available, and registered");
                $('#serviceWorkerStatus').removeClass("apiAvailable apiUnavailable")
                        .addClass("apiAvailable");
            } else {
                $('#serviceWorkerStatus').html("ServiceWorker API available, but not registered");
                $('#serviceWorkerStatus').removeClass("apiAvailable apiUnavailable")
                        .addClass("apiUnavailable");
            }
        } else {
            $('#serviceWorkerStatus').html("ServiceWorker API unavailable");
            $('#serviceWorkerStatus').removeClass("apiAvailable apiUnavailable")
                    .addClass("apiUnavailable");
        }
    }
    
    var contentInjectionMode;
    
    /**
     * Sets the given injection mode.
     * This involves registering (or re-enabling) the Service Worker if necessary
     * It also refreshes the API status for the user afterwards.
     * 
     * @param {String} value The chosen content injection mode : 'jquery' or 'serviceworker'
     */
    function setContentInjectionMode(value) {
        if (value === 'jquery') {
            if (isServiceWorkerReady()) {
                // We need to disable the ServiceWorker
                // Unregistering it does not seem to work as expected : the ServiceWorker
                // is indeed unregistered but still active...
                // So we have to disable it manually (even if it's still registered and active)
                navigator.serviceWorker.controller.postMessage({'action': 'disable'});
                messageChannel = null;
            }
            refreshAPIStatus();
        } else if (value === 'serviceworker') {
            if (!isServiceWorkerAvailable()) {
                alert("The ServiceWorker API is not available on your device. Falling back to JQuery mode");
                setContentInjectionMode('jquery');
                return;
            }
            if (!isMessageChannelAvailable()) {
                alert("The MessageChannel API is not available on your device. Falling back to JQuery mode");
                setContentInjectionMode('jquery');
                return;
            }
            
            if (!messageChannel) {
                // Let's create the messageChannel for the 2-way communication
                // with the Service Worker
                messageChannel = new MessageChannel();
                messageChannel.port1.onmessage = handleMessageChannelMessage;
            }
                    
            if (!isServiceWorkerReady()) {
                $('#serviceWorkerStatus').html("ServiceWorker API available : trying to register it...");
                navigator.serviceWorker.register('../service-worker.js').then(function (reg) {
                    console.log('serviceWorker registered', reg);
                    serviceWorkerRegistration = reg;
                    refreshAPIStatus();
                    
                    // We need to wait for the ServiceWorker to be activated
                    // before sending the first init message
                    var serviceWorker = reg.installing || reg.waiting || reg.active;
                    serviceWorker.addEventListener('statechange', function(statechangeevent) {
                        if (statechangeevent.target.state === 'activated') {
                            console.log("try to post an init message to ServiceWorker");
                            navigator.serviceWorker.controller.postMessage({'action': 'init'}, [messageChannel.port2]);
                            console.log("init message sent to ServiceWorker");
                        }
                    });
                }, function (err) {
                    console.error('error while registering serviceWorker', err);
                    refreshAPIStatus();
                });
            } else {
                console.log("try to re-post an init message to ServiceWorker, to re-enable it in case it was disabled");
                navigator.serviceWorker.controller.postMessage({'action': 'init'}, [messageChannel.port2]);
                console.log("init message sent to ServiceWorker");
            }
        }
        $('input:radio[name=contentInjectionMode]').prop('checked', false);
        $('input:radio[name=contentInjectionMode]').filter('[value="' + value + '"]').prop('checked', true);
        contentInjectionMode = value;
        // Save the value in a cookie, so that to be able to keep it after a reload/restart
        cookies.setItem('lastContentInjectionMode', value, Infinity);
    }
    
    /**
     * If the ServiceWorker mode is selected, warn the user before activating it
     * @param chosenContentInjectionMode The mode that the user has chosen
     */
    function checkWarnServiceWorkerMode(chosenContentInjectionMode) {
        if (chosenContentInjectionMode === 'serviceworker' && !cookies.hasItem("warnedServiceWorkerMode")) {
            // The user selected the "serviceworker" mode, which is still unstable
            // So let's display a warning to the user

            // If the focus is on the search field, we have to move it,
            // else the keyboard hides the message
            if ($("#prefix").is(":focus")) {
                $("searchArticles").focus();
            }
            if (confirm("The 'Service Worker' mode is still UNSTABLE for now."
                + " It happens that the application needs to be reinstalled (or the ServiceWorker manually removed)."
                + " Please confirm with OK that you're ready to face this kind of bugs, or click Cancel to stay in 'jQuery' mode.")) {
                // We will not display this warning again for one day
                cookies.setItem("warnedServiceWorkerMode", true, 86400);
                return true;
            }
            else {
                return false;
            }
        }
        return true;
    }
    
    // At launch, we try to set the last content injection mode (stored in a cookie)
    var lastContentInjectionMode = cookies.getItem('lastContentInjectionMode');
    if (lastContentInjectionMode) {
        setContentInjectionMode(lastContentInjectionMode);
    }
    else {
        setContentInjectionMode('jquery');
    }
    
    var serviceWorkerRegistration = null;
    
    /**
     * Tells if the ServiceWorker API is available
     * https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorker
     * @returns {Boolean}
     */
    function isServiceWorkerAvailable() {
        return ('serviceWorker' in navigator);
    }
    
    /**
     * Tells if the MessageChannel API is available
     * https://developer.mozilla.org/en-US/docs/Web/API/MessageChannel
     * @returns {Boolean}
     */
    function isMessageChannelAvailable() {
        try{
            var dummyMessageChannel = new MessageChannel();
            if (dummyMessageChannel) return true;
        }
        catch (e){
            return false;
        }
        return false;
    }
    
    /**
     * Tells if the ServiceWorker is registered, and ready to capture HTTP requests
     * and inject content in articles.
     * @returns {Boolean}
     */
    function isServiceWorkerReady() {
        // Return true if the serviceWorkerRegistration is not null and not undefined
        return (serviceWorkerRegistration);
    }
    
    /**
     * 
     * @type Array.<StorageFirefoxOS>
     */
    var storages = [];
    function searchForArchivesInPreferencesOrStorage() {
        // First see if the list of archives is stored in the cookie
        var listOfArchivesFromCookie = cookies.getItem("listOfArchives");
        if (listOfArchivesFromCookie !== null && listOfArchivesFromCookie !== undefined && listOfArchivesFromCookie !== "") {
            var directories = listOfArchivesFromCookie.split('|');
            populateDropDownListOfArchives(directories);
        }
        else {
            searchForArchivesInStorage();
        }
    }
    function searchForArchivesInStorage() {
        // If DeviceStorage is available, we look for archives in it
        $("#btnConfigure").click();
        $('#scanningForArchives').show();
        zimArchiveLoader.scanForArchives(storages, populateDropDownListOfArchives);
    }

    if ($.isFunction(navigator.getDeviceStorages)) {
        // The method getDeviceStorages is available (FxOS>=1.1)
        storages = $.map(navigator.getDeviceStorages("sdcard"), function(s) {
            return new abstractFilesystemAccess.StorageFirefoxOS(s);
        });
    }

    if (storages !== null && storages.length > 0) {
        // Make a fake first access to device storage, in order to ask the user for confirmation if necessary.
        // This way, it is only done once at this moment, instead of being done several times in callbacks
        // After that, we can start looking for archives
        storages[0].get("fake-file-to-read").then(searchForArchivesInPreferencesOrStorage,
                                                  searchForArchivesInPreferencesOrStorage);
    }else{ 
        // when switching from url based loading to file based ensures UI is visible    
        displayFileSelect();
        var params={};
        location.search.replace(/[?&]+([^=&]+)=([^&]*)/gi,function(s,k,v){params[k]=v});
        if(params["archive"]) // == wiki_en_2016-12
        {
            resetUI();    
            selectedArchive = zimArchiveLoader.loadArchiveFromURL(params["archive"]);
            archiveStatusUpdate();

            if(params["title"]){
                goToArticle(params["title"]);                
            }else if(params["titleSearch"]){
                var keyword = decodeURIComponent(params["titleSearch"]);
                $("title").html("Search Results for "+keyword);
                searchDirEntriesFromPrefix(keyword);
            }else if(params["imageSearch"]){
                var keyword = decodeURIComponent(params["imageSearch"]);
                $("title").html("ImageSearch Results for "+keyword);
                searchDirEntriesFromImagePrefix(keyword);
            }else if("random" in params){
                goToRandomArticle();
            }
            else{
                selectedArchive.getDirEntryByURL("M/Counter").then(function(dirEntry) {
                    selectedArchive.readArticle(dirEntry, 
                        (de,content) => $('#articleContent').contents().find('body').html("Loaded archive:"+selectedArchive._file._files[0].name+". It contains:<br>"+
                            content.split(';').join('<br>')+
                            "<br>Total Article Count:" + selectedArchive._file.articleCount));
                });
                
                                
            }
        }else{
	        // If DeviceStorage is not available, we display the file select components
            if (document.getElementById('archiveFiles').files && document.getElementById('archiveFiles').files.length>0) {
                // Archive files are already selected, 
                setLocalArchiveFromFileSelect();
            }else{
               $("#btnConfigure").click();
            }
	    }
    }


    // Display the article when the user goes back in the browser history
    window.onpopstate = function(event) {
        if (event.state) {
            var title = event.state.title;
            var titleSearch = event.state.titleSearch;
            var imageSearch = event.state.imageSearch;
            
            resetUI();

            if (title && !(""===title)) {
                goToArticle(title);
            }
            else if (titleSearch && !(""===titleSearch)) {
                $('#prefix').val(titleSearch);
                $("title").html(titleSearch);
                searchDirEntriesFromPrefix($('#prefix').val());
            }else if(imageSearch && !(""===imageSearch)){
                //disable prefix change handler
                //$('#prefix').val(imageSearch);
                //enable prefix change handler
                $("title").html(imageSearch);
                searchDirEntriesFromImagePrefix(imageSearch);
            }
        }
    };
    
    /**
     * Populate the drop-down list of archives with the given list
     * @param {Array.<String>} archiveDirectories
     */
    function populateDropDownListOfArchives(archiveDirectories) {
        $('#scanningForArchives').hide();
        $('#chooseArchiveFromLocalStorage').show();
        var comboArchiveList = document.getElementById('archiveList');
        comboArchiveList.options.length = 0;
        for (var i = 0; i < archiveDirectories.length; i++) {
            var archiveDirectory = archiveDirectories[i];
            if (archiveDirectory === "/") {
                alert("It looks like you have put some archive files at the root of your sdcard (or internal storage). Please move them in a subdirectory");
            }
            else {
                comboArchiveList.options[i] = new Option(archiveDirectory, archiveDirectory);
            }
        }
        // Store the list of archives in a cookie, to avoid rescanning at each start
        cookies.setItem("listOfArchives", archiveDirectories.join('|'), Infinity);
        
        $('#archiveList').on('change', setLocalArchiveFromArchiveList);
        if (comboArchiveList.options.length > 0) {
            var lastSelectedArchive = cookies.getItem("lastSelectedArchive");
            if (lastSelectedArchive !== null && lastSelectedArchive !== undefined && lastSelectedArchive !== "") {
                // Attempt to select the corresponding item in the list, if it exists
                if ($("#archiveList option[value='"+lastSelectedArchive+"']").length > 0) {
                    $("#archiveList").val(lastSelectedArchive);
                }
            }
            // Set the localArchive as the last selected (or the first one if it has never been selected)
            setLocalArchiveFromArchiveList();
        }
        else {
            alert("Welcome to Kiwix! This application needs at least a ZIM file in your SD-card (or internal storage). Please download one and put it on the device (see About section). Also check that your device is not connected to a computer through USB device storage (which often locks the SD-card content)");
            $("#btnAbout").click();
            var isAndroid = (navigator.userAgent.indexOf("Android") !== -1);
            if (isAndroid) {
                alert("You seem to be using an Android device. Be aware that there is a bug on Firefox, that prevents finding Wikipedia archives in a SD-card (at least on some devices. See about section). Please put the archive in the internal storage if the application can't find it.");
            }
        }
    }

    /**
     * Sets the localArchive from the selected archive in the drop-down list
     */
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
                    var storage = storages[i];
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
                if (storages.length === 1) {
                    selectedStorage = storages[0];
                }
                else {
                    alert("Something weird happened with the DeviceStorage API : found a directory without prefix : "
                        + archiveDirectory + ", but there were " + storages.length
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

    /**
     * Displays the zone to select files from the archive
     */
    function displayFileSelect() {
        $('#openLocalFiles').show();
        $('#archiveFiles').on('change', setLocalArchiveFromFileSelect);
    }

    function setLocalArchiveFromFileList(files) {
        // Reset the cssDirEntryCache and cssBlobCache. Must be done when archive changes.
        if(cssBlobCache) 
            cssBlobCache = new Map();
        if(cssDirEntryCache) 
            cssDirEntryCache = new Map();
        selectedArchive = zimArchiveLoader.loadArchiveFromFiles(files, function (archive) {
            // The archive is set : go back to home page to start searching
            $("#btnHome").click();
        });
    }
    /**
     * Sets the localArchive from the File selects populated by user
     */
    function setLocalArchiveFromFileSelect() {
        // if firefox is started in xhrff mode loading archive from url 
        // and then user switches to archive via fileselctor change the mode to file 
        // for readslice to use the right mode. This is because init.js won't get reloaded in this case. 
        if(module.config().mode=="xhrFF"){
            // module.config().mode="file"; is not enough as mode must be set in util and finder too 
            // so trigger a reload
            // [TODO] This is temp hack - find a way to set mode across modules
            location.replace(uiUtil.removeUrlParameters(location.href));
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

    /**
     * Handle key input in the prefix input zone
     * @param {Event} evt
     */
    function onKeyUpPrefix(evt) {
        // Use a timeout, so that very quick typing does not cause a lot of overhead
        // It is also necessary for the words suggestions to work inside Firefox OS
        if(window.timeoutKeyUpPrefix) {
            window.clearTimeout(window.timeoutKeyUpPrefix);
        }
        window.timeoutKeyUpPrefix = window.setTimeout(function() {
            var prefix = $("#prefix").val();
            if (prefix && prefix.length>0) {
                $('#searchArticles').click();
            }
        }
        ,700);
    }


    /**
     * Search the index for DirEntries with title that start with the given prefix (implemented
     * with a binary search inside the index file)
     * @param {String} prefix
     */
    function searchDirEntriesFromPrefix(prefix) {
        resetUI();
        statusUpdate("Searching...", "btn-warning")
        if (selectedArchive !== null && selectedArchive.isReady()) {
            selectedArchive.findDirEntriesWithPrefix(prefix.trim(), MAX_SEARCH_RESULT_SIZE, populateListOfArticles);
        } else {
            // We have to remove the focus from the search field,
            // so that the keyboard does not stay above the message
            $("#searchArticles").focus();
            //alert("Archive not set : please select an archive");
            statusUpdate("Archive not set!");
            $("#btnConfigure").click();
        }
    }
    var ResultSet;
    window.getSearchResults = function getSearchResults(){
        return ResultSet;
    }
    function searchDirEntriesFromImagePrefix(keyword) {
        resetUI();
        $("#articleContent").attr('src', "A/imageResults.html")
        $("#articleContent").contents().scrollTop(0);            
        /* TODO Show Progress */
        statusUpdate("Searching...", "btn-warn")
        //var keyword = decodeURIComponent(prefix); 
        ResultSet = new Map();
        if (selectedArchive !== null && selectedArchive.isReady()) {
            selectedArchive.findDirEntriesAndContent(keyword, MAX_SEARCH_RESULT_SIZE, 
                displayImagesInFrame);
        } else {
            // We have to remove the focus from the search field,
            // so that the keyboard does not stay above the message
            $("#searchArticles").focus();
            //alert("Archive not set : please select an archive");
            statusUpdate("Archive not set!");
            $("#btnConfigure").click();
        }
    }
  
    /**
     * Display the list of articles with the given array of DirEntry
     * @param {Array.<DirEntry>} dirEntryArray
     * @param {Integer} maxArticles
     */
    function populateListOfArticles(dirEntryArray, maxArticles) {       
        var nbDirEntry = 0;
        if (dirEntryArray) {
            nbDirEntry = dirEntryArray.length;
        }

        var message;
        if (maxArticles >= 0 && nbDirEntry >= maxArticles) {
            message = maxArticles + " first articles below (refine your search).";
        }
        else {
            message = nbDirEntry + " articles found.";
        }
        if (nbDirEntry === 0) {
            message = "No articles found.";
        }
        statusUpdate(message, "btn-success")
        
        var articleListDiv = $('#articleList');
        var articleListDivHtml = "";
        for (var i = 0; i < dirEntryArray.length; i++) {
            var dirEntry = dirEntryArray[i];
            var snip_id = dirEntry.cluster +"_"+ dirEntry.blob; 
            articleListDivHtml += "<a href='#' dirEntryId='" + dirEntry.toStringId().replace(/'/g,"&apos;")
                    + "' class='list-group-item'>" + dirEntry.title + "<p class='small' id='"+ snip_id + "'></p></a>";
            fillSnippet(dirEntry, snip_id);    
        }
        articleListDiv.html(articleListDivHtml);
        $("#articleList a").on("click",handleTitleClick);
        $('#articleList').show();
    }
    
    /**
     * Handles the click on the title of an article in search results
     * @param {Event} event
     * @returns {Boolean}
     */
    function handleTitleClick(event) {
        // TODO: Can be refactored/reused? url->DirEnt step gets skipped by saving dirent in search result link        
        var dirEntryId = event.target.getAttribute("dirEntryId");
        resetUI();
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
            statusUpdate("Reading...", "bg-warning");
            $("#articleContent").contents().html("");
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

    function fillSnippet(dirEntry, snip_id) {
        
        //if (dirEntry.isRedirect()) {
        //    selectedArchive.resolveRedirect(dirEntry, readArticle);
        //}
        //else {
            // The only reason this doesn't work is utf8 would be reqd dep here
            //dirEntry.readData().then(function (data){
            selectedArchive.readArticle(dirEntry, function(title, data){
                //TODO: too heavy duty - optimize
                var snippet = new uiUtil.snippet($(data).find("p")).parse();
                $("#"+snip_id).html(snippet + "...");
            });
        //}
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
            selectedArchive.readArticle(dirEntry, displayArticleInFrame);
        }
    }
    
    var messageChannel;
    
    /**
     * Function that handles a message of the messageChannel.
     * It tries to read the content in the backend, and sends it back to the ServiceWorker
     * @param {Event} event
     */
    function handleMessageChannelMessage(event) {
        if (event.data.error) {
            console.error("Error in MessageChannel", event.data.error);
            reject(event.data.error);
        } else {
            console.log("the ServiceWorker sent a message on port1", event.data);
            if (event.data.action === "askForContent") {
                console.log("we are asked for a content : let's try to answer to this message");
                var url = event.data.url;
                var messagePort = event.ports[0];
                var readFile = function(dirEntry) {
                    if (dirEntry === null) {
                        console.error("URL " + url + " not found in archive.");
                        messagePort.postMessage({'action': 'giveContent', 'url' : url, 'content': ''});
                    } else if (dirEntry.isRedirect()) {
                        selectedArchive.resolveRedirect(dirEntry, readFile);
                    } else {
                        console.log("Reading binary file...");
                        selectedArchive.readBinaryFile(dirEntry, function(content) {
                            messagePort.postMessage({'action': 'giveContent', 'url' : url, 'content': content});
                            console.log("content sent to ServiceWorker");
                        });
                    }
                };
                selectedArchive.getDirEntryByURL(url).then(readFile).fail(function() {
                    messagePort.postMessage({'action': 'giveContent', 'url' : url, 'content': new UInt8Array()});
                });
            }
            else {
                console.error("Invalid message received", event.data);
            }
        }
    };
    
    // Compile some regular expressions needed to modify links
    var regexpImageLink = /^.?\/?[^:]+:(.*)/;
    var regexpPath = /^(.*\/)[^\/]+$/;
    // These regular expressions match both relative and absolute URLs
    // Since late 2014, all ZIM files should use relative URLs
    var regexpImageUrl = /^(?:\.\.\/|\/)+(I\/.*)$/;
    var regexpMetadataUrl = /^(?:\.\.\/|\/)+(-\/.*)$/;
    // This regular expression matches the href of all <link> tags containing rel="stylesheet" in raw HTML
    var regexpSheetHref = /(<link\s+(?=[^>]*rel\s*=\s*["']stylesheet)[^>]*href\s*=\s*["'])([^"']+)(["'][^>]*>)/ig;
    // Stores a url to direntry mapping and is refered to/updated anytime there is a css lookup 
    // When archive changes these caches should be reset. 
    // Currently happens only in setLocalArchiveFromFileList.
    var cssDirEntryCache = new Map();
    var cssBlobCache = new Map();
    // Promise that gets resolved after css load used to control article loading
    var cssLoaded;

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
        var url = uiUtil.removeUrlParameters(decodeURIComponent(hrefURL));
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

    function setupTableOfContents(){
        var iframe = document.getElementById('articleContent');
        var innerDoc = iframe.contentDocument || iframe.contentWindow.document;
        var tableOfContents = new uiUtil.toc(innerDoc);
        var headings = tableOfContents.getHeadingObjects();
        var dropup = '<span class="dropup"><button class="btn btn-primary btn-sm dropdown-toggle" type="button" id="dropdownMenu2" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false"> In This Article <span class="caret"></span> </button> <ul class="dropdown-menu" aria-labelledby="dropdownMenu2">';
        headings.forEach(function(heading){
            if(heading.tagName == "H1")
                dropup = dropup + '<li><a href="javascript:void(0)" onclick="$(&apos;#articleContent&apos;).contents().scrollTop($(&apos;#articleContent&apos;).contents().find(&apos;#'+heading.id+'&apos;).offset().top)">'+heading.textContent+'</a></li>';
            else if(heading.tagName == "H2")
                dropup = dropup + '<li class="small"><a href="javascript:void(0)" onclick="$(&apos;#articleContent&apos;).contents().scrollTop($(&apos;#articleContent&apos;).contents().find(&apos;#'+heading.id+'&apos;).offset().top)">'+heading.textContent+'</a></li>';
            //else
                //Currently skip smaller headings until toc scrolling works
                //dropup = ...
        });
        dropup = dropup + '</ul></span>'
        statusUpdateHTML(dropup);
    }

    /**
     * Display the the given HTML article in the web page,
     * and convert links to javascript calls
     * NB : in some error cases, the given title can be null, and the htmlArticle contains the error message
     * @param {DirEntry} dirEntry [BUG] Really title I think
     * @param {String} htmlArticle
     */
    function displayArticleInFrame(dirEntry, htmlArticle) {
        // Scroll the iframe to its top
        $("#articleContent").contents().scrollTop(0);

        // Display the article inside the web page.
	    // Prevents unnecessary 404's being produced when iframe loads images
        //var $body = $(htmlArticle);
        //console.log("before data-src");
        /*$body.find('img').each(function(){
            var image = $(this);
            $(image).attr("data-src", $(image).attr("src"));
            $(image).removeAttr("src");
        });*/
        htmlArticle = htmlArticle.replace(/(<img\s+[^>]*\b)src(\s*=)/ig, "$1data-src$2");
        //console.log("after data-src");
        // 404's should now only be produced on loading css and js
        var $body = $(htmlArticle);
        
        $('#articleContent').contents().find('body').html($body);
       
        // If the ServiceWorker is not useable, we need to fallback to parse the DOM
        // to inject math images, and replace some links with javascript calls
        if (contentInjectionMode === 'jquery') {

            // Convert links into javascript calls
            $('#articleContent').contents().find('body').find('a').each(function() {    
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
                        statusUpdate("Missing article");
                        return false;
                    });
                }
                else if (url.slice(0, 1) === "#") {
                    // It's an anchor link : do nothing
                }
                else if (url.substring(0, 4) === "http") {
                    // It's an external link : open in a new tab
                    $(this).attr("target", "_blank");
                }
                else if (url.match(regexpImageLink)
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
                    }
                    // Remove the initial slash if it's an absolute URL
                    else if (url.substring(0, 1) === "/") {
                        url = url.substring(1);
                    }
                    $(this).on('click', function(e) {
                        var decodedURL = decodeURIComponent(url);
                        pushBrowserHistoryState(decodedURL);
                        goToArticle(decodedURL);
                        return false;
                    });
                }
            });

            // Load images
            var imageLoadCompletions = [];
            var AboveTheFold = module.config().initialImageLoad;
            var imgNodes = $('#articleContent').contents().find('img');//$('#articleContent img');
            if(imgNodes.length > 0)
            {
                var imageURLs = [].slice.call(imgNodes)
                               .map(el => decodeURIComponent(el.getAttribute('data-src')
                                            .match(regexpImageUrl)[1]));
                console.time("Total Image Lookup+Read+Inject Time");
                console.time("TimeToFirstPaint");
                var f = selectedArchive.findImages(imageURLs, {
                    onEachResult: function(index, dirEntry){
                        var p = selectedArchive._file.blob(dirEntry.cluster, dirEntry.blob);
                        p.then(function (content) {
                            if(util.endsWith(dirEntry.url.toLowerCase(), ".png")){
                                uiUtil.feedNodeWithBlob($(imgNodes[index]), 'src', content, 'image/png');
                            }else if (util.endsWith(dirEntry.url.toLowerCase(), ".svg")){
                                uiUtil.feedNodeWithBlob($(imgNodes[index]), 'src', content, 'image/svg+xml;');
                            }else if (util.endsWith(dirEntry.url.toLowerCase(), ".jpg")){
                                uiUtil.feedNodeWithBlob($(imgNodes[index]), 'src', content, 'image/jpeg');
                            }else{
                                //console.error("Unrecognized image format: " + dirEntry.url);
                                uiUtil.feedNodeWithBlob($(imgNodes[index]), 'src', content, 'image');
                            }
                        },function (){
                            console.error("Failed loading " + dirEntry.url );
                        }).then(() => Promise.resolve());
                        imageLoadCompletions.push(p);
                    },
                    onFirstWorkerCompletion: function(){
                        return Promise.all(cssLoaded).then(()=>console.timeEnd("TimeToFirstPaint"));
                    }, 
                    onAllWorkersCompletion: function(resultsCount){
                        Promise.all(imageLoadCompletions).then(function (){
                            console.log("Images loaded:" + resultsCount);
                            console.timeEnd("Total Image Lookup+Read+Inject Time");
                            //console.log("fetches: "+performance.getEntriesByType("resource").length);
                            //console.log(" time: "+ performance.getEntries()[0]);
                        });
                    }
                });
            }

            // Load CSS content
            // initialize the promise array
            cssLoaded = [];
            $('#articleContent').contents().find('body').find('link[rel=stylesheet]').each(function() {
                var link = $(this);
                // We try to find its name (from an absolute or relative URL)
                var hrefMatch = link.attr("href").match(regexpMetadataUrl);
                if (hrefMatch) {
                    loadCSS(link, hrefMatch[1]);
                }
            });
            //console.log("# of css files loading:" + cssLoaded.length);
            setupTableOfContents();    
        }
    }

    function displayImagesInFrame(dirEntry, htmlArticle) {
        var foundDirEntry = dirEntry;
        var totalCount = 0;
        if (ResultSet.has(dirEntry.title)){
            ResultSet.set(foundDirEntry.title, {images:[], redirectedFrom:"", dup:"skipped"});
            console.log(dirEntry.title + " already processed, skipping...")
            return;
        }else{
            ResultSet.set(foundDirEntry.title, {images:[],redirectedFrom:"", dup:""});
        }

        // TODO: Not required as its not going to be set to frame src
        htmlArticle = htmlArticle.replace(/(<img\s+[^>]*\b)src(\s*=)/ig, "$1data-src$2");
        var $body = $(htmlArticle);
        var imgNodes = $body.contents().find('img').filter(function(index){
            return $(this).attr('width') > 50
        } );//$('#articleContent img');
        if(imgNodes.length==0)
        {
            console.log(foundDirEntry.title +" no images found");
            return;
        }
        //var snippet = new uiUtil.snippet($body.contents().find("p")).parse();
        var imageURLs = [].slice.call(imgNodes)
                           .map(el => decodeURIComponent(el.getAttribute('data-src')
                                        .match(regexpImageUrl)[1]));
        if(imageURLs.length > 0){
            console.time(foundDirEntry.title+" "+imageURLs.length+" Image Lookup+Read+Inject Time");
        }
        var imageLoadCompletions = [];
        var AboveTheFold = module.config().initialImageLoad;
        var f = selectedArchive.findImages(imageURLs, {
                onEachResult: function(index, dirEntry){
                    var p = selectedArchive._file.blob(dirEntry.cluster, dirEntry.blob);
                    p.then(function (content) {
                        if(util.endsWith(dirEntry.url.toLowerCase(), ".svg")){
                            uiUtil.feedNodeWithBlob($(imgNodes[index]), 'src', content, 'image/svg+xml;');
                        }else{
                            uiUtil.feedNodeWithBlob($(imgNodes[index]), 'src', content, 'image');
                        }
                        var tmpnode = $('<span>', {class:"grid-item"});
                        tmpnode.on('click', function(e) {
                                var decodedURL = decodeURIComponent(foundDirEntry.url);
                                pushBrowserHistoryState(decodedURL);
                                goToArticle(decodedURL);
                                return false;
                        });
                        $("#articleContent").contents().find('.grid').append(
                                tmpnode.append($(imgNodes[index])));
                        console.log("img added "+foundDirEntry.title +" "+ dirEntry.url);
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
                        totalCount = totalCount + imageLoadCompletions.length;
                        statusUpdate("Found pages:"+ ResultSet.size + " images:"+totalCount, "btn-primary");
                        console.timeEnd(foundDirEntry.title + " "+resultsCount+" Image Lookup+Read+Inject Time");
                    });
                }
            }
        );
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
        // This will ensure in url mode (as opposed to file selector mode)
        // archive parameter becomes part of the url string. 
        // Bookmarking links & Setting home page to a url will also be possible.
        var appendArchive = module.config().mode == "file" ? "" : "&archive="+ selectedArchive._file._files[0].name;

        if (title && !(""===title)) {
            stateObj.title = title;
            urlParameters = "?title=" + title + appendArchive;
            stateLabel = "Article : " + title;
        }
        else if (titleSearch && !(""===titleSearch)) {
            stateObj.titleSearch = titleSearch;
            urlParameters = "?titleSearch=" + titleSearch + appendArchive;
            stateLabel = "Keyword search : " + titleSearch;
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
        statusUpdate("Reading...", "bg-warning");
        $('#articleContent').contents().find('body').html("");
        readArticle(dirEntry);
    }

    /**
     * Replace article content with the one of the given url
     * @param {String} article url eg: Paris.html
     */
    function goToArticle(url) {
        selectedArchive.getDirEntryByURL(url).then(function(dirEntry) {
            if (dirEntry === null || dirEntry === undefined) {
                //alert("Article with url " + url + " not found in the archive");
                statusUpdate("Article not found:"+ url);
            }
            else {
                injectContent(dirEntry);
            }
        }).fail(function() { 
            //alert("Error reading article with title " + url);
            statusUpdate("Error reading " + url); 
        });
    }
    
    function goToRandomArticle() {
        selectedArchive.getRandomDirEntry(function(dirEntry) {
            if (dirEntry === null || dirEntry === undefined) {
                alert("Error finding random article.");
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
    }

    function goToMainArticle() {
        resetUI();
        archiveStatusUpdate();
        selectedArchive.getMainPageDirEntry(function(dirEntry) {
            if (dirEntry === null || dirEntry === undefined) {
                console.error("Error finding main article.");
            }
            else {
                if (dirEntry.namespace === 'A') {
                    pushBrowserHistoryState(dirEntry.url);
                    injectContent(dirEntry);
                }
                else {
                    console.error("The main page of this archive does not seem to be an article");
                }
            }
        });
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

    return { 
        stringifyArchive: stringifyArchive
    };
});
