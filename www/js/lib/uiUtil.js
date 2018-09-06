/**
 * uiUtil.js : Utility functions for the User Interface
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
define(['jquery'], function($) {

    
    /**
     * Creates a Blob from the given content, then a URL from this Blob
     * And put this URL in the attribute of the DOM node
     * 
     * This is useful to inject images (and other dependencies) inside an article
     * 
     * @param {Object} jQueryNode
     * @param {String} nodeAttribute
     * @param {Uint8Array} content
     * @param {String} mimeType
     */
    function feedNodeWithBlob(jQueryNode, nodeAttribute, content, mimeType) {
        var blob = new Blob([content], {type: mimeType});
        var url = URL.createObjectURL(blob);
        jQueryNode.on('load', function () {
            URL.revokeObjectURL(url);
        });
        jQueryNode.attr(nodeAttribute, url);
    }
        
    var regexpRemoveUrlParameters = new RegExp(/([^\?]+)\?.*$/);
    
    function removeUrlParameters(url) {
        if (regexpRemoveUrlParameters.test(url)) {
            return regexpRemoveUrlParameters.exec(url)[1];
        } else {
            return url;
        }
    }

    function TableOfContents (articleDoc) {
        this.doc = articleDoc;
        this.headings = this.doc.querySelectorAll("h1, h2, h3, h4, h5, h6");

        this.getHeadingObjects = function () {
            var headings = [];
            for (var i = 0; i < this.headings.length; i++) { 
                var element = this.headings[i];
                var obj = {};
                obj.id = element.id;
                obj.index = i;
                obj.textContent = element.textContent;
                obj.tagName = element.tagName;
                headings.push(obj);
            }
            return headings;
        }
    }

    function Snippet (paras) {
        this.elements = paras;
        this.parse = function () {
            var snippet = '';
            //var elements = this.doc.getElementsByTagName('p');
            for (var i = 0; i < this.elements.length; i++) {
                var localSnippet = this.extractCleanText(this.elements[i]);
                if (snippet != '') {snippet += ' ';}
                snippet += localSnippet;
                if (snippet.length > 200) {break;}
            }
            return snippet.slice(0, 200);
        }

        this.extractCleanText = function (element) {
            var text = element.textContent || element.innerText || "";
            if (text.replace(/\s/g, '').length) {
                var regex = /\[[0-9|a-z|A-Z| ]*\]/g;
                text = text.replace(regex, "");
                return text;
            } else {
                return '';
            }
        }
    }

    /**
     * Checks whether an element is fully or partially in view
     * This is useful for progressive download of images inside an article
     *
     * @param {Object} el
     * @param {Boolean} fully
     */
    function isElementInView(el, fully) {
        var elemTop = el.getBoundingClientRect().top;
        var elemBottom = el.getBoundingClientRect().bottom;

        var isVisible = fully ? elemTop < window.innerHeight && elemBottom >= 0 :
            elemTop >= 0 && elemBottom <= window.innerHeight;
        return isVisible;
    }

    /**
    * This is a utility function to check the window of images visible to the user.
    * It needs to be run within the scope of the main images array.
    * Returns an object with attributes .firstVisible and .lastVisible
    * They return null if no images are currently visible.
    */
    function checkVisibleImages() {
        var firstVisible = null;
        var lastVisible = null;
        //Determine first and last visible images in the current window
        for (var i = 0; i < images.length; i++) {
            //console.log("Checking #" + i + ": " + images[i].getAttribute("data-kiwixsrc"));
            if (isElementInView(images[i], true)) {
                //console.log("#" + i + " *is* visible");
                if (firstVisible == null) { firstVisible = i; }
                lastVisible = i;
            } else {
                //console.log("#" + i + " is not visible");
                if (firstVisible != null && lastVisible != null) {
                    console.log("First visible image is #" + firstVisible + "\n" +
                        "Last visible image is #" + lastVisible);
                    break; //We've found the last visible image, so stop the loop
                }
            }
        }
        return {
            firstVisible: firstVisible,
            lastVisible: lastVisible
        };
    }

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

    function archiveStatusUpdate(selectedArchive){
        try{
            if(selectedArchive.isReady()){
                var name = selectedArchive._file._files[0].name;
                //if(name && name !=="undefined")
                statusUpdate(selectedArchive._file._files[0].name, "bg-success");
            }else
                statusUpdate("Archive not set!!", "btn-danger"); 
        }catch (e){
            statusUpdate("Archive not set!!", "btn-danger");
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

    function updateLoadMoreButton(str){
        var button = '<button class="btn btn-success btn-sm" type="button" id="loadmore">'+str+'</button>'
        statusUpdateHTML(button);
    }

    function setupHandlers(){
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
        $('#btnAbout').on('click', function(e) {
            $("title").html("Kiwix");
            resetUI();
            $('#about').show();
            // TODO: Not reqd each time - store it statically once about/help page settles
            // setupTableOfContents(document.getElementById("about"));
            return false;
        });
    }

    function onHome(handler){
        $('#btnHome').on('click', function(e) {
            // Show the selected content in the page
            resetUI();
            // Give the focus to the search field, and clean up the page contents
            $("#prefix").val("");
            $('#prefix').focus();
            handler();
            return false;
        });        
    }

    function onRandom(fn){
        $("#btnRandomArticle").on("click", function(e) {
            resetUI();
            fn();        
        });
    }   

    function onConfig(fn){
        $('#btnConfigure').on('click', function(e) {
            $("title").html("Kiwix");
            resetUI();
            $('#configuration').show();
            fn();
            return false;
        });
    } 

    // @page is a DOM document or element, 
    function setupTableOfContents(page){
        var iframe = page.nodeType == 9; // to handle toc of about page - remove when done
        var toc = new TableOfContents(page);
        var headings = toc.getHeadingObjects();
        var dropup = '<span class="dropup"><button class="btn btn-primary btn-sm dropdown-toggle" type="button" id="dropdownMenu2" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false"> In This Article <span class="caret"></span> </button> <ul class="dropdown-menu" aria-labelledby="dropdownMenu2">';
        headings.forEach(function(heading){
            if(heading.tagName == "H1")
                dropup = dropup + '<li><a href="javascript:void(0)" onclick="$(&apos;#articleContent&apos;).contents().scrollTop($(&apos;#articleContent&apos;).contents().find(&apos;#'+heading.id+'&apos;).offset().top)">'+heading.textContent+'</a></li>';
            else if(heading.tagName == "H2")
                if (iframe)
                    dropup = dropup + '<li class="small"><a href="javascript:void(0)" onclick="$(&apos;#articleContent&apos;).contents().scrollTop($(&apos;#articleContent&apos;).contents().find(&apos;#'+heading.id+'&apos;).offset().top)">'+heading.textContent+'</a></li>';
                else
                    dropup = dropup + '<li class="small"><a href="javascript:void(0)" onclick="location.href=&apos;#'+heading.id+'&apos;">'+heading.textContent+'</a></li>';
            //else
                //Currently skip smaller headings until toc scrolling works
                //dropup = ...
        });
        dropup = dropup + '</ul></span>'
        statusUpdateHTML(dropup);
    }

    /**
     * Populate the drop-down list of archives with the given list
     * @param {Array.<String>} archiveDirectories
     */
    function populateListOfArchives(archiveDirectories) {
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
        
        if (comboArchiveList.options.length > 0) {
            var lastSelectedArchive = cookies.getItem("lastSelectedArchive");
            if (lastSelectedArchive !== null && lastSelectedArchive !== undefined && lastSelectedArchive !== "") {
                // Attempt to select the corresponding item in the list, if it exists
                if ($("#archiveList option[value='"+lastSelectedArchive+"']").length > 0) {
                    $("#archiveList").val(lastSelectedArchive);
                }
            }
            // Set the localArchive as the last selected (or the first one if it has never been selected)
            //setLocalArchiveFromArchiveList();
            //setLocalArchiveFromArchiveList(setArchive);
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
     * Functions and classes exposed by this module
     */
    return {
        feedNodeWithBlob: feedNodeWithBlob,
        removeUrlParameters: removeUrlParameters,
        toc: TableOfContents,
        snippet: Snippet,
        isElementInView: isElementInView,
        checkVisibleImages: checkVisibleImages,
        reset: resetUI,
        archiveStatusUpdate: archiveStatusUpdate,
        status: statusUpdate,
        statusHTML: statusUpdateHTML,
        statusLoadMore: updateLoadMoreButton,
        setupHandlers: setupHandlers,
        setupTableOfContents: setupTableOfContents,
        onHome: onHome,
        onConfig: onConfig,
        onRandom: onRandom,
        populateListOfArchives: populateListOfArchives 
    };
});
