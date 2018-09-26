'use strict';
define(['jquery', 'uiUtil'], function($, ui) {

	// function updateSearchUI(ctx){
 //        //$('#prefix').val(ctx.keyword);
 //        $("#from").val(ctx.from);
 //        $("#upto").val(ctx.upto);
 //        $("#caseSensitive").prop("checked", ctx.caseSensitive);
 //        $('input:radio[name=match]').prop('checked', false);
 //        $('input:radio[name=match]').filter('[value="' + ctx.match + '"]').prop('checked', true);
 //    }
        /**
     * Handle key input in the prefix input zone
     * @param {Event} evt
     */
    function onKeyUpPrefix(evt, timeout) {
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
        , timeout);
    }

	function setupHandlers(context){
		//updateSearchUI(context);
	    // Both search bar key presses and submit button press handled here.
	    $('#formArticleSearchnew').on('submit', function(e) {
	        document.getElementById("searchArticles").click();
	        return false;
	    });
	    // Setup search options UI handlers
	    // var matchoptions = document.getElementsByName("match");
	    // function setMatchFn(event){
	    //     context.match = event.target.value;
	    //     $("#filterDropDown").dropdown("toggle");        
	    //     console.log("MATCHER: " + context.match);
	    // }
	    // for(var i = 0; i < matchoptions.length ; i++)
	    //     matchoptions[i].addEventListener("change" , setMatchFn);
	    // var caseSense = document.getElementById('caseSensitive')
	    // caseSense.addEventListener("change", function(event){
	    //     context.caseSensitive = event.target.checked; 
	    //     //console.log("CASE: " + searchContext.caseSensitive);
	    // });
	    // $('#filters').on('submit', function(e){
	    //     context.from = parseInt($("#from").val());
	    //     context.upto = parseInt($("#upto").val());
	    //     $("#filterDropDown").dropdown("toggle");
	    //     document.getElementById("searchArticles").click();
	    //     return false;
	    // });		
	}

	return {
		setupHandlers: setupHandlers,
		//update: updateSearchUI,
		autoComplete: onKeyUpPrefix
	}

});
