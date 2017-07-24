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
define(["module"], function(module) {

    finder.prototype = {
        urlArray : null,
        onFirstResult: null,
        onEachResult: null,
        //onWorkerCompletion: null,
        onAllWorkersCompletion: null
    }

    function finder(urllist, type, callbacks, archive){
        this.resultstrack=0;
        this.N=2;
        this.firstpaint=0;
        this.AboveTheFold = module.config().initialImageLoad;
        
        this.workerCompletions = 0;
        this.urlArray = urllist;
        // [TODO] refactor
        this.onFirstResult = callbacks.hasOwnProperty("onFirstResult") ? callbacks["onFirstResult"] : function (){};   
        this.onEachResult = callbacks.hasOwnProperty("onEachResult") ? callbacks["onEachResult"] : function (){};
        //this.onWorkerCompletion = callbacks.hasOwnProperty("onWorkerCompletion") ? callbacks["onWorkerCompletion"] : function (){};        
        this.onAllWorkersCompletion = callbacks.hasOwnProperty("onAllWorkersCompletion") ? callbacks["onAllWorkersCompletion"] : function (){};
        // [TODO] This stuff is being passed around unnecessarily. 
        // Find a way to share it across modules and worker. Maybe a singleton selectedArchive
        this.file = archive._file._files[0]; 
        this.articleCount = archive._file.articleCount; 
        this.urlPtrPos =  archive._file.urlPtrPos;

        this.type = type;
    }

    finder.prototype.run = function(){
        if (this.type && this.type == "quick") //"quickImageLoad"
            this.workerStartwithFold();
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
                    if(that.workerCompletions == that.N)
                        that.onAllWorkersCompletion(that.resultstrack);
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
                module.config().mode]);
        });
    }

    finder.prototype.workerStartwithFold = function(){
        //console.time("Total Image Lookup+Read Time");
        var that= this;
        var step = this.urlArray.length/this.N;
        if (step > 0 && this.urlArray.length > this.AboveTheFold){ 
            var p = this.createDirEntryFinder(0, this.AboveTheFold);
            p.then(that.onFirstResult).then(function (){
                //BUG: creates a worker if start=end eg:urlarray.len=11  
                that.createDirEntryFinder(that.AboveTheFold, step);
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

    /* Even split if greater than 10
     finder.prototype.workerStart = function(){
        //console.time("All Image Lookup+Read Time");
        var step = imageArray.length/N;
        if (imageArray.length > 10){                    
            for (var k = 0; k < N; k += 1){
                var start = k*step;
                var end = start+step;
                createDirEntryFinder(start, end);
                //console.log(start +" "+ end);
            }    
        }else{
            N=1;
            createDirEntryFinder(0, imageArray.length);
        }                
    }*/

    return {
        start: finder
    };
});