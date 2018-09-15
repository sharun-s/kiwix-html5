#Note:
# This script generates the knownArchive.js file and places it in www/js/lib/
# The knownArchive.all object contains all known psuedo zim objects(as opposed to prev used File based objects) that can be loaded via url. 
# Such a list is required to scan/detect archives present in the www dir. This is done in library.js to generate the list in the settings page of the app.  
# This generation process is currently run outside of the app cause its much faster than downloading metadata reqd for each zim via the app itself.
# TODO: The "downloadable archive" catalog of links/torrents comes from library.kiwix.org and can eventually be merged with the updateknownarchive process so that links and torrents are also part of knownArchive.all.
# TODO: Include size, description, author and other relevant meta data in knownArchives.

# Download catalog
curl -L http://library.kiwix.org/catalog/root.xml | xml2 > catalog.xml

# Extract just the download links
grep -oP "/feed/entry/link/@href\=.*\.meta4" catalog.xml | cut -d"=" -f2 | rev| cut -c7- | rev > catalog_onlyurls

#grep -oP "/feed/entry/summary\=.*" catalog.xml|cut -d"=" -f2 > catalog_desc 
#grep -oP "/feed/entry/title\=.*" catalog.xml|cut -d"=" -f2 > catalog_titles
#grep -oP "/feed/entry/author/name\=.*" catalog.xml|cut -d"=" -f2 > catalog_author
#xargs -a catalog_onlyurls -I{} HEAD {} | grep -i content-length |sed 's/.*: //' >> catalog_sizes
#paste -d- catalog_titles catalog_author catalog_desc > full_cat 

# Download first 88 bytes of all files
# WARNING: This takes time!!!
xargs -a catalog_onlyurls -I{} echo "curl -L {} | dd bs=1 count=88 of={}"| sed -E "s/(of=).*\//\1/" | bash

#echo 'Files not updated due to download errors/timeouts (todo Remove these entries)'
#find . -size 0c

sed -E "s/(.*\/)//" catalog_onlyurls > catalog_onlynames.txt

# GenerateKnownArchives.html will go through all the files in catalog_onlynames and generate pseudo file json objects for each
# The map of all filename->jsonstring is downloaded as knownArchives.js
rm ~/Downloads/knownArchives.js
firefox GenerateKnownArchives.html

inotifywait ~/Downloads/knownArchive.js -e create -e moved_to | mv ~/Downloads/knownArchive.js ../www/js/lib/

# Cleanup
#find . -size 88c -exec rm {} \;
#rm catalog_onlynames.txt
#rm catalog_onlyurls
#rm catalog.xml