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
define([], function() {

    
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

    /**
     * Functions and classes exposed by this module
     */
    return {
        feedNodeWithBlob: feedNodeWithBlob,
        removeUrlParameters: removeUrlParameters,
        toc: TableOfContents,
        snippet: Snippet,
        isElementInView: isElementInView,
        checkVisibleImages: checkVisibleImages
    };
});
