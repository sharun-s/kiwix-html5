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
define(['util', 'module'], function(util, module) {
    // this changes in test
    var WORKERPATH = module.config().workerPath; 

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
        this.file = archive;//._file._files[0]; 
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
            // worker code is placed in the same location as server-worker so that tests.js work
            var def = new Worker(WORKERPATH);
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
    // Calling this titleFinder rather than keywordFinder as the lookups are using an Index built of Article Titles. 
    // keyword = what is typed in search bar. prefix = matching algo. title where title index is being used. variant - case variations of the keyword
    // Results are collected onEachResult in the allResults array and passed back in the onAllWorkersCompletion callback
    // NOTE: onEach and onAll will be called for EACH variant, 
    // if searchContext.caseSensitive = false, for each case variantion of the keyword one worker will be started.
    // if searchContext.caseSensitiva = true, only one worker is created.
    // Use the only the reqd callbacks depending on how finder return values need to be processed 
    function titleFinder(searchContext, callbacks, archive, mode){
        this.allResults=[];
        this.workerCompletions = 0;
        this.ctx = searchContext;
        this.variantCount = 0;

        // This will be called with 1 param - the dirEntry found
        this.onEachResult = callbacks.hasOwnProperty("onEachResult") ? callbacks["onEachResult"] : function (){};
        // This will be called with 3 params - keyword, matchesCount, last examined index
        this.onAllResults = callbacks.hasOwnProperty("onAllResults") ? callbacks["onAllResults"] : function (){};
        // This will be called when all workers are done with 1 param - allResults
        this.onAllWorkersCompletion = callbacks.hasOwnProperty("onAllWorkersCompletion") ? callbacks["onAllWorkersCompletion"] : function (){};

        this.file = archive;//._file._files[0]; 
        this.articleCount = archive._file.articleCount; 
        this.urlPtrPos =  archive._file.urlPtrPos;
        this.titlePtrPos = archive._file.titlePtrPos;
        this.mode = mode;
        this.run();        
    }

    // TODO Keeping run seperate from init to test perf cases where worker can be kept alive to handle loadmore vs starting a new worker each time
    titleFinder.prototype.run = function(){
        var allworkers=[], prefixVariants=[];
        var that = this; 
        console.time("search");
        if(this.ctx.caseSensitive){
            var p = this.createDirEntryFinder(this.ctx.keyword);
            allworkers.push(p);
            this.variantCount = 1; 
        }else{
            prefixVariants = util.removeDuplicateStringsInSmallArray([ 
                util.ucFirstLetter(this.ctx.keyword), 
                util.lcFirstLetter(this.ctx.keyword), 
                util.ucEveryFirstLetter(this.ctx.keyword),
                this.ctx.keyword]);
            console.log(prefixVariants);
            this.variantCount = prefixVariants.length;
            allworkers = prefixVariants.map((p) => this.createDirEntryFinder(p));            
        }
        Promise.all(allworkers).then(()=>{
            if(that.workerCompletions == that.variantCount)
                that.onAllWorkersCompletion(that.allResults);
            console.timeEnd("search")
        });
    }

    titleFinder.prototype.createDirEntryFinder = function(variant){
        var that = this;
        return new Promise(function (resolve,reject){
            var def = new Worker(WORKERPATH);
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
                    var dirEntry = e.data[0];
                    that.allResults.push(dirEntry);   
                    that.onEachResult(dirEntry);                            
                }
            };
            var msg =[that.file, that.articleCount, that.urlPtrPos, that.titlePtrPos,
                        variant,
                        that.ctx.upto, 
                        that.mode,
                        that.ctx.from,
                        that.ctx.match, 
                        that.ctx.loadmore ];
            def.postMessage(msg);
        });
    }

    return {
        urlSearch: finder,
        titleSearch: titleFinder
    };
});