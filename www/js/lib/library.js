'use strict';
define(['jquery', 'zimArchiveLoader'], function($, zimArchiveLoader) {

	var catalogue = [];
	var lang="en";
	var doc;

	function getLatestCatalogue(){
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
            doc = x.responseXML;
            processDoc();
          }
        };
        x.send(null);
    }

    function processDoc(){
    	var namespaceResolver = (function () {
            var prefixMap = {
                a: "http://www.w3.org/2005/Atom",
                ospd: "http://opds-spec.org/2010/catalog"
            };
            return function (prefix) {
                return prefixMap[prefix] || null;
            };
        }());
        
    	    var link = doc.evaluate('/a:feed/a:entry/a:link[@type="application/x-zim" and contains(@href,"_'+lang+'_") and contains(@href,"2018")]', doc, namespaceResolver, 0, null);
    	    console.log(link);
            var result=link.iterateNext();
            catalogue=[]
            while(result){
            	catalogue.push({
                url: result.attributes["href"].value,
                title: result.parentElement.children[0].textContent, // title
                favicon: result.parentElement.children[2].textContent, // favicon
                date: result.parentElement.children[3].textContent, // date
                description: result.parentElement.children[4].textContent, // description
                creator: result.parentElement.children[6].textContent // creator
                });
                console.log(result.attributes["href"].value);
                result=link.iterateNext();
            }
            generateCatalogueUI();
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
        var groupHTML=''; //= '<ul id="accordian" class="list-group">';
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
        //groupHTML = groupHTML + '</ul>';
        //jqueryNode.html(groupHTML);
        $("#accordian").html(groupHTML);
    }
    var items = [];

    function loadDetected(jqn){
        zimArchiveLoader.onDiskMatches().then(function(zimsOnDisk){
            jqn.append("<h4 style='border-bottom:2px solid #004499'>Detected Archives</h4>");
            if (zimsOnDisk.length===0){
                jqn.append("<mark>These are <strong>NO</strong> <a href='openzim.org'>zim</a> files found in the default storage location - the <strong>'www'</strong> directory of your kiwix folder. Try the options below...</mark>");
            }else{
                jqn.append("<small class='text-muted'>These are <a href='openzim.org'>zim</a> files found in the default storage location - the <strong>'www'</strong> directory of your kiwix folder</small>");
                $.each( zimsOnDisk, function( i, item ) {
                    var temp = item.split('_');
                    items.push( "<li class='list-group-item small' id='" + i + "'><strong>" + temp[0].charAt(0).toUpperCase() + temp[0].slice(1) +"</strong> ("+item + ") " +" <button onclick='location.href = location.href.replace( /[\?#].*|$/, &apos;?archive="+item+"&random=&apos;);'> LOAD</button></li>");
                });
                jqn.append(items.join( "" ));                
            }
        });        
    }

	function load( jqn ) {    
        // Add downloadable ZIM's
        jqn.append("<h4 style='border-bottom:2px solid #004499'>Downloadable Archives</h4> \
        	<small class='text-muted'> The Update button gets the latest list of downloadable archives from <a href='library.kiwix.org'>kiwix.org</a>. After the download completes, copy the zim file into the <strong>'www'</strong> directory of your kiwix folder</small> \
            <p><small><mark>Download may take a few seconds to start.</small></p> \
        	<button id='getLatest'>Update Catalogue</button> \
        	<label for='langSelect'>Language</label> \
        	<select id='langSelect'>\
        	<option value='ar'>العربية</option>\
        	‎<option value='az'>azərbaycanca</option>\
        	‎<option value='bn'>বাংলা</option>\
        	<option value='ca'>català</option>\
        	<option value='da'>dansk</option>\
        	<option value='de'>Deutsch</option>\
        	<option value='el'>Ελληνικά</option>\
        	<option value='en' selected>‎English</option> \
        	<option value='es'> español</option> \
        	<option value='fa'>فارسی</option> \
        	<option value='fr'>français</option> \
        	<option value='gl'>galego</option> \
        	<option value='he'>עברית</option> \
        	<option value='id'>Bahasa Indonesia</option> \
        	<option value='it'>italiano</option> \
        	<option value='ja'>日本語</option>\
        	<option value='ka'>ქართული</option>\
        	<option value='ko'>한국어</option>\
        	<option value='ku-latn'>Kurdî (latînî)‎‎</option>\
        	<option value='lt'>lietuvių</option>\
        	<option value='ml'>മലയാളം</option>\
        	<option value='ms'>Bahasa Melayu</option> \
        	‎<option value='nl'>Nederlands</option>\
        	<option value='pl'>polski</option>\
        	<option value='ps'>پښتو</option>\
        	<option value='pt'>português</option>\
        	<option value='ru'>русский</option> ‎\
        	<option value='sd'>سنڌي</option> ‎\
        	<option value='tr'>Türkçe</option> ‎\
        	<option value='ur'>اردو</option> ‎\
        	<option value='zh'>中文</option> ‎\
        	‎<option value='zh-cn'> 中文（中国大陆）‎</option> ‎\
        	‎<option value='zh-tw'>中文（台灣）‎</option></select>\
        	<div class='progress'> \
  				<div class='progress-bar' role='progressbar' aria-valuenow='0' aria-valuemin='0' aria-valuemax='100' style='height:20%;width:0%'> \
  				</div> \
			</div> <ul id='accordian' class='list-group'></ul>\ ");
        $("#langSelect").on("change",function (){
			lang = this.value;
    		console.log(lang + " lang selected");
    		processDoc();
        });
        $("#getLatest").on("click",getLatestCatalogue);         
    };

	return {
        loadDownloadables: load,
        loadDetected:loadDetected
    };
});
