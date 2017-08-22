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

define(['jquery', 'zimArchiveLoader', 'util', 'uiUtil', 'cookies','abstractFilesystemAccess', 'module', 'control', 'finder', 'utf8'],
 function($, zimArchiveLoader, util, uiUtil, cookies, abstractFilesystemAccess, module, control, finder, utf8) {

    var settings = module.config().settings;
     
    // Disable any eval() call in jQuery : it's disabled by CSP in any packaged application
    // It happens on some wiktionary archives, because there is some javascript inside the html article
    // Cf http://forum.jquery.com/topic/jquery-ajax-disable-script-eval
    jQuery.globalEval = function(code) {
        // jQuery believes the javascript has been executed, but we did nothing
        // In any case, that would have been blocked by CSP for package applications
        console.log("jQuery tried to run some javascript with eval(), which is not allowed in packaged applications");
    };

    //$.getJSON( "library-1617-en.json", function( data ) {
    $.getJSON( "library8Aug2017-1617-en.json", function( data ) {    
        // Add links to ZIM on disk. Onclick change selected archive
        var onDisk = zimArchiveLoader.onDiskMatches(data);
        $("#zims").append("<h4>Detected Archives On Disk: </h4>");
        var items = [];
        $.each( onDisk, function( i, item ) {
            items.push( "<li class='list-group-item small' id='" + i + "'>" + "<img width='24px' height='24px' src='data:"+item.faviconMimeType
            +";base64,"+item.favicon+ "'><strong>" + item.title +"</strong> "
            +item.date+ " " +" <button onclick='location.href = location.href.replace( /[\?#].*|$/, &apos;?archive="+item.filename+"&random=&apos;);'> LOAD</button></li>");
        });
        $("#zims").append(items.join( "" ));
        // Add downloadable ZIM's
        $("#zims").append("<h5>Download Links:</h5>");
        var groups = {};

        $.each( data, function( i, item ) {
            if(item.title in groups)
                groups[item.title].push(item);
            else
                groups[item.title] = [item];
        });
        // group links by title, sort groups by lenth, sort links in group by date
        var groupHTML = '<ul id="accordian" class="list-group">';
        for(var group in groups){
            groups[group].sort(function(a,b){return new Date(b.date) - new Date(a.date);});
        }
        var groupsSorted = Object.keys(groups).sort(function(a,b){return groups[b].length - groups[a].length});
        // generate subGroup HTML 
        for(var i=0;i<groupsSorted.length;i++){
            var items = [], subGroup = groups[groupsSorted[i]];
            // Group Header
            var groupHeader = '<a class="list-group-item" data-toggle="collapse" href="#g'+i+'" ><span class="badge">'+ subGroup.length+'</span><strong> '+groupsSorted[i]+'</strong> <span class="small"> <em>'
            +subGroup[0].description+'</em> - Creator:<strong>'+ subGroup[0].creator+'</strong> Publisher:<strong>'+ subGroup[0].publisher+'</strong></span></a><ul style="padding:2px" id="g'+i+'" class="collapse  list-group">'; 
            for(var j=0;j<subGroup.length;j++){
                var item = subGroup[j];
                items.push( "<li class ='list-group-item small' style='padding:2px'><span class='label label-primary'>"+item.date+"</span> Articles:"+item.articleCount+ "    Media:"+item.mediaCount + "    <a href='"+item.url +"'> <span class='glyphicon glyphicon-download'></span></a> <a href=''> <span class='glyphicon glyphicon-magnet'></span></a> </li>");                
            }
            groupHTML = groupHTML + groupHeader + items.join( "" ) +"</ul>";
        }
        groupHTML = groupHTML + '</ul>';
        $("#zims").append(groupHTML); 
    });

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
        try{
            var name = selectedArchive._file._files[0].name;
            if(name && name !=="undefined")
                statusUpdate(selectedArchive._file._files[0].name, "bg-success");
        }catch (e){
            statusUpdate("Archive not set!!", "btn-danger");
            //throw {name:"KiwixError", message:"Archive Undefined"};    
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
    $('#formArticleSearchnew').on('submit', function(e) {
        //console.count("formsubmit");
        document.getElementById("searchArticles").click();
        return false;
    });
    if(settings.autoComplete)
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
        archiveStatusUpdate();
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

    async function loadVid(){
        var url = decodeURIComponent('I/m/-Pluto-FlyoverAnimation-20150918.webm.jpg');
        //console.log(url); 
        var dev = await selectedArchive.getDirEntryByURL(url);
        var data = await dev.readData();
        var blob = new Blob([data], {type: 'video'});
        var url = URL.createObjectURL(blob);
        $('#articleContent').contents().find('body').html('<img src='+url+'></img>');
        //$('#articleContent').contents().find('body').html('<video src='+url+'></video>');                
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
                pushBrowserHistoryState(params["title"]);
                goToArticle(params["title"]);                
            }else if(params["titleSearch"]){
                var keyword = decodeURIComponent(params["titleSearch"]);
                pushBrowserHistoryState(null, keyword, null);
                $("title").html("Search Results for "+keyword);
                // TODO set searchbar value to keyword ensuring it doesn't trigger keypress/form submit and god knows whatelse
                searchDirEntriesFromPrefix(keyword);
            }else if(params["imageSearch"]){
                var keyword = decodeURIComponent(params["imageSearch"]);
                pushBrowserHistoryState(null, null, keyword);
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
                //loadVid();
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
        if(module.config().mode !== "file"){
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
        , settings.autoCompleteResubmitTimer);
    }

    // snippetController - Controls rate of additions of snippets
    // Not really required if maxResults < 10-20 with loadmore enabled on Desktop 
    // Is handy when maxResults is set higher, as an async article read happens for each result  
    // TODO: Controller is optional. 
    var snippetController;  
    function fillResult(dirEntry){         
        var snip_id = dirEntry.redirect ? dirEntry.redirectTarget : dirEntry.cluster+"_"+dirEntry.blob;
        var deToString = dirEntry.offset + '|' + dirEntry.mimetype + '|' + dirEntry.namespace + '|' + dirEntry.cluster + '|' +dirEntry.blob + '|' + dirEntry.url + '|' + dirEntry.title + '|' + dirEntry.redirect + '|' + dirEntry.redirectTarget;
        var articleListDivHtml = "<a href='#' dirEntryId='" 
        + deToString.replace(/'/g,"&apos;")
        + "' class='list-group-item' style='padding:2px'>" + dirEntry.title; 
        if(dirEntry.namespace !== "A")
            articleListDivHtml = articleListDivHtml + "<strong style='color:green;'>" +dirEntry.namespace+" "+ dirEntry.url.slice(-3)+" </strong>";
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
                console.log("WARNING: Skipping Non-Article returned by finder:" + dirEntry.namespace, dirEntry.url.slice(-3));
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
     * Search the index for DirEntries with title that start with the given prefix (implemented
     * with a binary search inside the index file)
     * @param {String} prefix
     */
    var totalFound, totalImages, articlesMatchedProcessed, nonArticlesMatchedProcessed; 
    function searchDirEntriesFromPrefix(keyword, continueFrom) {
        if(!continueFrom){
            resetUI();
            searchInit();
        }
        statusUpdate("Searching...", "btn-warning");
        var variantWithMostMatches, variantMatches=[];
        
        // If incremental UI update of results is not desired move this inside onAllResults
        $('#articleList').show();
        if (selectedArchive !== null && selectedArchive.isReady()) {
            if (settings.includeSnippet)
                snippetController = new control.asyncJobQueue(settings.maxAsyncSnippetReads, fillSnippet);
            var f = new finder.initKeywordSearch(keyword.trim(), settings.maxResults, 
                            { onEachResult: fillResult, 
                              onAllResults: function (variant, matchCount, continueFromIndex){
                                $("#articleList a").on("click",handleTitleClick);
                                variantMatches.push([variant, matchCount, continueFromIndex]);
                                totalFound = totalFound + matchCount;
                              },
                              onAllWorkersCompletion: function(allResults){
                                // assert allResults.length against totalFound
                                // TODO Is this the right way of updating the button and its handler?
                                updateLoadMoreButton("Found:" +totalFound+ " Load More...");
                                variantMatches.forEach((obj, i) => console.log(obj));
                                variantWithMostMatches = variantMatches.sort((a,b) => a[1]<b[1])[0];
                                $("#loadmore").on('click', function(e) {
                                    searchDirEntriesFromPrefix(variantWithMostMatches[0], variantWithMostMatches[2]);
                                });
                                //if(continueFrom)
                                //    $("#articleContent").contents().scrollTop($("#articleList:last-child").offset().top);
                              }
                            }, selectedArchive, module.config().mode);
            if(continueFrom)
                f.run({"continueFrom": continueFrom});
            else
                f.run();
        } else {
            // We have to remove the focus from the search field,
            // so that the keyboard does not stay above the message
            $("#searchArticles").focus();
            //alert("Archive not set : please select an archive");
            statusUpdate("Archive not set!");
            $("#btnConfigure").click();
        }
    }
    var ResultSet, variantMatches=[];
    window.getSearchResults = function getSearchResults(){
        return ResultSet;
    }

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
    // BUG: end of search condition can cause searchDone to get called multiple times and before it actually done. Fix: Make displayImagesInFrame promise based.
    function searchDone(){
        // TODO Is this the right way of updating the button and its handler?
        // for keywordsearch - updateLoadMoreButton("Found:" +totalCount+ " Load More...");
        //var totImgCount from ResultSet
        updateLoadMoreButton("Pages:"+ totalFound+" Uniq:"+ResultSet.size + " Images:"+totalImages, "btn-success");
        // ResultSet.forEach((v,k) =>{ console.log(k); console.log(v.images.length, v.redirectedFrom, v.dup);})
        variantMatches.forEach((obj, i) => console.log(obj));
        var variantWithMostMatches = variantMatches.sort((a,b) => a[1]<b[1])[0];
        $("#loadmore").on('click', function(e) {
            // TODO: for keywordsearch this is searchDirEntriesFromPrefix
            searchDirEntriesFromImagePrefix(variantWithMostMatches[0], variantWithMostMatches[2]);
        });
        console.timeEnd("ImageSearch Lookup+Inject+Load");
    }

    function searchDirEntriesFromImagePrefix(keyword, continueFrom) {
        console.time("ImageSearch Lookup+Inject+Load");
        if(!continueFrom){
            resetUI();
            $("#articleContent").attr('src', "A/imageResults.html");
            searchInit();            
        }else{
            variantMatches=[];
        }
        //$("#articleContent").contents().scrollTop(0);            
        /* TODO Show Progress */
        statusUpdate("Searching...", "btn-warning")
        //var keyword = decodeURIComponent(prefix); 
        if (selectedArchive !== null && selectedArchive.isReady()) {
            // used in processArticleForImages TODO refactor
            articleReadController = new control.asyncJobQueue(settings.maxAsyncArticleReads, fillImages);
            var f = new finder.initKeywordSearch(keyword, settings.maxResults, {
                onEachResult: processArticleForImages,
                // NOTE: this just means title index lookup is done for one variant not UI update completion
                onAllResults: singleVariantDone
                // onAllWorkerTODO: use to improve searchDone detection promise.all( all dislayinFrame resolved promises)
            }, selectedArchive, module.config().mode);
            if(continueFrom)
                f.run({"continueFrom":continueFrom});
            else
                f.run();
        } else {
            // We have to remove the focus from the search field,
            // so that the keyboard does not stay above the message
            $("#searchArticles").focus();
            statusUpdate("Archive not set!");
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
                    // TODO: too heavy duty - optimize
                    // var top = $(data); <== gives the best snips tho
                    // TODO: Issue here is, when infoboxes are present first para 
                    // can get pushed way down into the article
                    //console.time(title);
                    data = utf8.parse(data);
                    var b = data.search(/<body/); 
                    var top = data.slice(b, b+4000);
                    // get rid of 404s
                    top = top.replace("src=","nosrc=");
                    var snippet = new uiUtil.snippet($(top).find("p")).parse();
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

    function updateLoadMoreButton(str){
        var button = '<button class="btn btn-success btn-sm" type="button" id="loadmore">'+str+'</button>'
        statusUpdateHTML(button);
    }

    function checkTypeAndInject(url, jQueryNode, imageBlob) {
        if(util.endsWith(url, ".png")){
            uiUtil.feedNodeWithBlob(jQueryNode, 'src', imageBlob, 'image/png');
        }else if (util.endsWith(url, ".svg")){
            uiUtil.feedNodeWithBlob(jQueryNode, 'src', imageBlob, 'image/svg+xml;');
        }else if (util.endsWith(url, ".jpg")){
            uiUtil.feedNodeWithBlob(jQueryNode, 'src', imageBlob, 'image/jpeg');
        }else{
            //console.error("Unrecognized image format: " + dirEntry.url);
            uiUtil.feedNodeWithBlob(jQueryNode, 'src', imageBlob, 'image');
        }
    }


    /**
     * Display the the given HTML article in the web page,
     * and convert links to javascript calls
     * NB : in some error cases, the given title can be null, and the htmlArticle contains the error message
     * @param {DirEntry} dirEntry [BUG] Really title I think
     * @param {String} htmlArticle
     */
    async function displayArticleInFrame(dirEntry, htmlArticle) {
        // Scroll the iframe to its top
        $("#articleContent").contents().scrollTop(0);
        htmlArticle = htmlArticle.replace(/(<img\s+[^>]*\b)src(\s*=)/ig, "$1data-src$2");
        var iframe = document.getElementById('articleContent');
        var innerDoc = iframe.contentDocument || iframe.contentWindow.document;
        var $iframe = $('#articleContent').contents();
        // NOTE:keepScripts set to false so no js 404's but change to true to if reqd
        var $body = $.parseHTML(htmlArticle, innerDoc ,false);
        // To get links - $body.filter((j) => { return j.nodeName == "LINK"})
        var $iframeBody = $iframe.find('body');
        $iframeBody.html($body);
       
        // If the ServiceWorker is not useable, we need to fallback to parse the DOM
        // to inject math images, and replace some links with javascript calls
        if (contentInjectionMode === 'jquery') {

            // Convert links into javascript calls
            $iframeBody.find('a').each(function() {    
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
            var imgNodes = $iframeBody.find('img');//$('#articleContent img');
            // Refer #278 & #297 - For math heavy page use the controller - TEMP Solution till ZIM files support mathjax
            // No need for the controller otherwise
            var svgmathload = imgNodes.filter(".mwe-math-fallback-image-inline").length;
            var controller, controlledLoading = svgmathload/imgNodes.length > 0.5 ? true : false;
            console.log("SVG Math Load:"+ (svgmathload/imgNodes.length)*100);
            if(imgNodes.length > 0)
            {
                var imageURLs = [].slice.call(imgNodes)
                               .map(el => decodeURIComponent(el.getAttribute('data-src')
                                            .match(regexpImageUrl)[1]));
                console.time("Total Image Lookup+Read+Inject Time");
                console.time("TimeToFirstPaint");

                var injectImage = function (index, dirEntry){
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
                var f = new finder.initURLSearch(imageURLs, {
                    onEachResult: function(index, dirEntry){
                        var p;
                        if(controlledLoading)
                            p = controller.processORAddToQueue(index, dirEntry);
                        else
                            p = injectImage(index, dirEntry); 
                        imageLoadCompletions.push(p);
                    },
                    onFirstWorkerCompletion: function(){
                        // NOTE: any waiting that is done here will hold up all other worker starts
                        return Promise.all(cssLoaded).then(()=>console.timeEnd("TimeToFirstPaint"));
                    }, 
                    onAllWorkersCompletion: function(resultsCount){
                        Promise.all(imageLoadCompletions).then(function (){
                            console.log("Images loaded:" + resultsCount);
                            console.timeEnd("Total Image Lookup+Read+Inject Time");
                        });
                    }
                }, selectedArchive, module.config().mode, settings.workerCount);
                f.run({type:"quick", initialImageLoad: settings.initialImageLoad});
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
            //console.log("# of css files loading:" + cssLoaded.length);
            setupTableOfContents();    
        }
    }

    function displayImagesInFrame(dirEntry, htmlArticle) {
        if(!dirEntry && !htmlArticle){
            statusUpdate("No matches found", "btn-success");
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
            console.log(foundDirEntry.title +" no images found");
            ResultSet.set(foundDirEntry.title, {images:[],redirectedFrom:foundDirEntry.redirectedFrom, dup:""});
            articlesMatchedProcessed++;
            if(totalFound == articlesMatchedProcessed + nonArticlesMatchedProcessed)
                searchDone();
            return;
        }
        //var snippet = new uiUtil.snippet($body.contents().find("p")).parse();
        var imageURLs = [].slice.call(imgNodes)
                           .map(el => decodeURIComponent(el.getAttribute('data-src')
                                        .match(regexpImageUrl)[1]));
        if(imageURLs.length > 0){
            console.time(foundDirEntry.title+" "+imageURLs.length+" Image Lookup+Read+Inject Time");
            ResultSet.set(foundDirEntry.title, {images:imageURLs, redirectedFrom:foundDirEntry.redirectedFrom, dup:""});
        }
        var imageLoadCompletions = [];
        var f = new finder.initURLSearch(imageURLs, {
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
                        if(totalFound == articlesMatchedProcessed + nonArticlesMatchedProcessed)
                            searchDone(); 
                    });
                }
            }, selectedArchive, module.config().mode, settings.workerCount 
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
        }).catch(function() { 
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
