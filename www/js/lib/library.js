'use strict';
define(['jquery', 'zimArchiveLoader'], function($, zimArchiveLoader) {

	var catalogue = [];
	function getLatestCatalogue(){
        var namespaceResolver = (function () {
            var prefixMap = {
                a: "http://www.w3.org/2005/Atom",
                ospd: "http://opds-spec.org/2010/catalog"
            };
            return function (prefix) {
                return prefixMap[prefix] || null;
            };
        }());
        var x = new XMLHttpRequest();
        x.open("GET", "http://library.kiwix.org/catalog/root.xml", true);
        x.onprogress = function(event){
            if(event.lengthComputable){
                var progress = (event.loaded/event.total)*100;
                console.log(progress);
                $(".progress-bar").css("width",progress+"%");
            }
        };
        x.onreadystatechange = function () {
          if (x.readyState == 4 && x.status == 200)
          {
            var doc = x.responseXML;
            var link = doc.evaluate('/a:feed/a:entry/a:link[@type="application/x-zim" and contains(@href,"_en_") and contains(@href,"2018")]', doc, namespaceResolver, 0, null);
            var result=link.iterateNext();
            while(result){
            	catalogue.push({
                url: result.attributes["href"].value,
                title: result.parentElement.children[0].textContent, // title
                favicon: result.parentElement.children[2].textContent, // favicon
                date: result.parentElement.children[3].textContent, // date
                description: result.parentElement.children[4].textContent, // description
                creator: result.parentElement.children[6].textContent // creator
                });
                result=link.iterateNext();
            }
            generateCatalogueUI();
          }
        };
        x.send(null);
    }

    function generateCatalogueUI(){
    	var groups = {};

        $.each( catalogue, function( i, item ) {
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
            +subGroup[0].description+'</em> - Creator:<strong>'+ subGroup[0].creator+
            '</strong></a><ul style="padding:2px" id="g'+i+'" class="collapse  list-group">'; 
            for(var j=0;j<subGroup.length;j++){
                var item = subGroup[j];
                items.push("<li class ='list-group-item small' style='padding:2px'> \
                	<a href='"+item.url.slice(0,-6) +"'>"+item.url.slice(30,-10).split('/')[1]+" <span class='glyphicon glyphicon-download'></span></a> </li>");	                
            }
            groupHTML = groupHTML + groupHeader + items.join( "" ) +"</ul>";
        }
        groupHTML = groupHTML + '</ul>';
        jqueryNode.append(groupHTML);
    }
    var items = [];
    var jqueryNode;

	function load( jqn ) {    
		jqueryNode = jqn;
        // Add links to ZIM on disk. Onclick change selected archive
        /*var onDisk = zimArchiveLoader.onDiskMatches(catalogue);
        jqueryNode.append("<h4>Detected Archives On Disk: </h4>");
        
        $.each( onDisk, function( i, item ) {
            items.push( "<li class='list-group-item small' id='" + i + "'>" + "<img width='24px' height='24px' src='data:"+item.faviconMimeType
            +";base64,"+item.favicon+ "'><strong>" + item.title +"</strong> "
            +item.date+ " " +" <button onclick='location.href = location.href.replace( /[\?#].*|$/, &apos;?archive="+item.filename+"&random=&apos;);'> LOAD</button></li>");
        });*/
        jqueryNode.append(items.join( "" ));
        // Add downloadable ZIM's
        jqueryNode.append("<h5>Available Archives:</h5> \
        	<p> The Update button gets the latest downloadable <strong>English</strong> Archives (ZIM files) </p>\
        	<p> (For the latest list in all other languages please visit the Kiwix <a href='http://wiki.kiwix.org/content'>website.</a>)</p>\
        	<button id='getLatest'>UPDATE CATALOGUE</button> \
        	<div class='progress'> \
  				<div class='progress-bar' role='progressbar' aria-valuenow='0' aria-valuemin='0' aria-valuemax='100' style='width:0%'> \
  				</div> \
			</div> \ ");
        $("#getLatest").on("click",getLatestCatalogue);         
    };

	return {
        loadCatalogue: load,
    };
});
