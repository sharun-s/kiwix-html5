below code based on session storage did not work 
cause a file:// request to the same local file domain is assumed to be different
In setLocalArchiveFromURL
var kA=sessionStorage.getItem('knownArchives');
        if(kA){
            console.log('loading ka from sessionStorage');
            zimArchiveLoader.knownArchives = JSON.parse(kA);
        }
        else{
            console.log('ka not set setting');
            sessionStorage.setItem('knownArchives', JSON.stringify(zimArchiveLoader.knownArchives));
        }
In setLocalArchiveFromFilelist
// if file is not in knownArchives - stringify and add
            // this will allow url mode to work when files not in knownArchive are opened via fileselector
            zimArchiveLoader.knownArchives[archive._file._files[0].name] = stringifyArchive();
            console.log( zimArchiveLoader.knownArchives);
            sessionStorage.setItem('knownArchives', JSON.stringify(zimArchiveLoader.knownArchives));



#download catalog
curl -L http://library.kiwix.org/catalog/root.xml | xml2 > catalog.xml

#extract just the download links
grep -oP "/feed/entry/link/@href\=.*\.meta4" catalog.xml | cut -d"=" -f2 | rev| cut -c7- | rev > catalog_onlyurls

#download first 88 bytes
xargs -a catalog_onlyurls -I{} echo "curl -L {} | dd bs=1 count=88 of={}"| sed -E "s/(of=).*\//\1/" | bash

#create header object
filearray = 
util.readSlice(fileArray[0], 0, 80).then(function(header)
            {
                var zf = new ZIMFile(fileArray);
                zf.articleCount = readInt(header, 24, 4);
                zf.clusterCount = readInt(header, 28, 4);
                zf.urlPtrPos = readInt(header, 32, 8);
                zf.titlePtrPos = readInt(header, 40, 8);
                zf.clusterPtrPos = readInt(header, 48, 8);
                zf.mimeListPos = readInt(header, 56, 8);
                zf.mainPage = readInt(header, 64, 4);
                zf.layoutPage = readInt(header, 68, 4);
                return zf;
            });