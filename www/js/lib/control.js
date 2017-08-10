/**
 * control.js: Functions to control async tasks initiation for performance tuning  .
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
define([], function() {

    // @param List of N elements have to be processed. Split among C processors. 
    // @param C is the the number of simultaneous processors initiated. 
    // If C = 1 list is processed sequentially. 
    // If C > 1, atmost C processes will be initiated at the same time. 
    // If C is too high all will get bogged down
    // @param process must return a promise immediately that resolves when its work is done 
    function asyncJobController(chainCount, list, process){
        var queue;

        function makeIterator(list){
            var index = 0;
            return { next: function (){ return index < list.length ? list[index++] : null; }
            }
        }

        if (list && list.length > 0 && chainCount > 0 && process)
            queue = makeIterator(list);
        else
            return;

        function next(){
            var job = queue.next();
            if (job)
                return process(job).then(next);
            else
                return Promise.resolve(); //ends the chain 
        }

        for(var i=0; i < chainCount; i++){
            var job = queue.next();
            if (job){
                process(job).then(next);    
            }
        }
    }

    // In the asyncJobController number of jobs to schedule is set at the begining 
    // Here jobs get added to the queue as they arrive. 
    // This is also useful when fixed number of async jobs spawn child aync jobs or are recursive
    // @param maxActive is basically chainCount as defined in asyncJobController
    // @param process is a function that must return a promise immediately that resolves when its work is done
    // [TODO] if the process fn does not resolve controller can get stuck  
    function asyncJobDynamicQueueController(maxActive, process){
        this.queue = []; // contains waiting jobs
        this.active = new Map(); // contains promises of active processes
        // arguments passed in here are passed to process
        asyncJobDynamicQueueController.prototype.processORAddToQueue = function (){
            // process the job if allowed else push it into wait queue
            if(this.active.size < maxActive){
                var promise = process.apply(null, arguments).then(()=>{
                                                // process done, remove from active, check for waiting jobs
                                                this.active.delete(arguments);
                                                // if jobs are queued pop one off and process it
                                                if (this.queue.length > 0){
                                                    // sigh...refactor 
                                                    return this.processORAddToQueue.apply(this, [].slice.call(this.queue.pop()));
                                                }   
                                            });
                this.active.set(arguments, promise);
                return promise;
            }else{
                this.queue.push(arguments);
            }                
        }
    }
    return {
        asyncJobs: asyncJobController,
        asyncJobQueue: asyncJobDynamicQueueController
    };
});