/**
 * finder.js: offlods finding large number of dirents to workers.
 *
 * Copyright 2017 Mossroy and contributors
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
define(['util'], function(util) {

    function finder(urllist, callbacks, archive, mode, workerCount){
        this.resultstrack=0;
        this.N = workerCount;
        //this.firstpaint=0;
        
        this.workerCompletions = 0;
        this.urlArray = urllist;
        // [TODO] refactor
        this.onEachResult = callbacks.hasOwnProperty("onEachResult") ? callbacks["onEachResult"] : function (){};
        //this.onWorkerCompletion = callbacks.hasOwnProperty("onWorkerCompletion") ? callbacks["onWorkerCompletion"] : function (){};        
        this.onFirstWorkerCompletion = callbacks.hasOwnProperty("onFirstWorkerCompletion") ? callbacks["onFirstWorkerCompletion"] : function (){};   
        this.onAllWorkersCompletion = callbacks.hasOwnProperty("onAllWorkersCompletion") ? callbacks["onAllWorkersCompletion"] : function (){};
        // [TODO] This stuff is being passed around unnecessarily. 
        // Find a way to share it across modules and worker. Maybe a singleton selectedArchive
        this.file = archive._file._files[0]; 
        this.articleCount = archive._file.articleCount; 
        this.urlPtrPos =  archive._file.urlPtrPos;
        
        this.mode = mode;
   }

    // This is a way to pick distribution of url to worker strategy
    finder.prototype.run = function(settings){
        if (settings && settings.type && settings.type == "quick") //"quickImageLoad"
            this.workerStartwithFold(settings.initialImageLoad);
        else
            this.workerStart(); 
    };    

    finder.prototype.createDirEntryFinder = function(startIndex, endIndex){
        var that = this;
        var _startIndex = Math.floor(startIndex);
        return new Promise(function (resolve,reject){
            var def = new Worker("dirEntryFinder.js");
            def.onmessage = function (e) {
                if(e.data[0] == "done" ){
                    resolve();
                    that.workerCompletions++;
                    //console.log("recvd done" + that.workerCompletions +" " + that.N);
                    if(that.workerCompletions == that.N){
                        if(that.N == 1)
                            that.onFirstWorkerCompletion();
                        that.onAllWorkersCompletion(that.resultstrack);
                    }
                    def.terminate();
                }else{
                    var index = e.data[0];                          
                    var dirEntry = e.data[1];
                    that.resultstrack++;   
                    that.onEachResult(_startIndex+index, dirEntry);                            
                }
            };
            def.postMessage( [ that.file, 
                that.articleCount, 
                that.urlPtrPos,
                // worker id (TODO: include article title)
                _startIndex+"-"+Math.floor(endIndex),
                that.urlArray.slice( startIndex, endIndex), 
                that.mode]);
        });
    }

    finder.prototype.workerStartwithFold = function(abv){
        var AboveTheFold = abv;
        var that= this;
        var step = this.urlArray.length/this.N;
        if (step > 0 && this.urlArray.length > AboveTheFold){ 
            var p = this.createDirEntryFinder(0, AboveTheFold);
            p.then(that.onFirstWorkerCompletion).then(function startTheRest(){
                //BUG: creates an extra do nothing (harmless) worker if step<=abv the fold  
                that.createDirEntryFinder(AboveTheFold, step);
                for (var k = 1; k < that.N; k += 1) {
                    var start = k*step;
                    var end = start+step;
                    that.createDirEntryFinder(start, end);
                }
                that.N++;                    
            });    
        }else{
            that.N = 1;
            that.createDirEntryFinder(0, that.urlArray.length);
        }                
    }

     //Even split if greater than 10
     finder.prototype.workerStart = function(){
        //console.time("All Image Lookup+Read Time");
        var step = this.urlArray.length/this.N;
        if (this.urlArray.length > 10){                    
            for (var k = 0; k < this.N; k += 1){
                var start = k*step;
                var end = start+step;
                this.createDirEntryFinder(start, end);
                //console.log(start +" "+ end);
            }    
        }else{
            this.N=1;
            this.createDirEntryFinder(0, this.urlArray.length);
        }                
    }
    // Calling this titleFinder rather than keywordFinder as the lookups are using an Index built of Article Titles. Need to refactor to clarify where to use keyword, title and prefix. All have great potential of being applied all over if not clearly defined. Right now trying to adhere to - keyword = what is typed in search bar. prefix = matching algo. title where title index is being used.
    function titleFinder(keyword, maxResults, callbacks, archive, mode){
        this.resultstrack=0;
        this.workerCompletions = 0;
        this.keyword = keyword;
        this.variantCount = 0;
        this.maxResults = maxResults;

        this.onEachResult = callbacks.hasOwnProperty("onEachResult") ? callbacks["onEachResult"] : function (){};
        this.onAllResults = callbacks.hasOwnProperty("onAllResults") ? callbacks["onAllResults"] : function (){};
        this.onAllWorkersCompletion = callbacks.hasOwnProperty("onAllWorkersCompletion") ? callbacks["onAllWorkersCompletion"] : function (){};

        this.file = archive._file._files[0]; 
        this.articleCount = archive._file.articleCount; 
        this.urlPtrPos =  archive._file.urlPtrPos;
        this.titlePtrPos = archive._file.titlePtrPos;
        this.mode = mode;        
    }

    //titleFinder.prototype.run = function(settings){
        // start a worker for each keyword variant
    //    this.startWorkers(); 
    //};

    titleFinder.prototype.run = function(settings){
        var allworkers=[], prefixVariants=[];
        var that = this;
        console.time("search");
        // on loadmore continue search only with the variant with the most matches
        if(settings && settings.continueFrom){
            var p = this.createDirEntryFinder(this.keyword, settings.continueFrom);
            allworkers.push(p);
            this.variantCount = 1; 
        }else{
            prefixVariants = util.removeDuplicateStringsInSmallArray([ 
                util.ucFirstLetter(this.keyword), 
                util.lcFirstLetter(this.keyword), 
                util.ucEveryFirstLetter(this.keyword),
                this.keyword]);
            console.log(prefixVariants);
            this.variantCount = prefixVariants.length;
            allworkers = prefixVariants.map((p) => this.createDirEntryFinder(p));            
        }
        Promise.all(allworkers).then(()=>{
            if(that.workerCompletions == that.variantCount)
                that.onAllWorkersCompletion();
            console.timeEnd("search")
        });
    }

    titleFinder.prototype.createDirEntryFinder = function(variant, continueFrom){
        var that = this;
        return new Promise(function (resolve,reject){
            var def = new Worker("dirEntryFinder.js");
            def.onmessage = function (e) {
                if(e.data[0] == "done" ){                    
                    that.workerCompletions++;
                    //console.log("recvd done" + that.workerCompletions);
                    def.terminate();
                    // params are - matchesFound, loadmore-index
                    // NOTE: This will happen for each worker i.e. variant
                    that.onAllResults(variant, e.data[1], e.data[2]);
                    resolve();
                }else{
                    //var index = e.data[0];                          
                    var dirEntry = e.data[0];
                    that.resultstrack++;   
                    that.onEachResult(dirEntry);                            
                }
            };
            var msg =[ that.file, 
                that.articleCount, 
                that.urlPtrPos,
                that.titlePtrPos,
                variant,
                that.maxResults, 
                that.mode];
            if(continueFrom)
                msg.push(continueFrom); 
            def.postMessage(msg);
        });
    }

    return {
        initURLSearch: finder,
        initKeywordSearch: titleFinder
    };
});