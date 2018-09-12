# Download catalog
curl -L http://library.kiwix.org/catalog/root.xml | xml2 > catalog.xml

# Extract just the download links
grep -oP "/feed/entry/link/@href\=.*\.meta4" catalog.xml | cut -d"=" -f2 | rev| cut -c7- | rev > catalog_onlyurls

# Download first 88 bytes of all files
# WARNING: This takes time!!!
xargs -a catalog_onlyurls -I{} echo "curl -L {} | dd bs=1 count=88 of={}"| sed -E "s/(of=).*\//\1/" | bash

sed -E "s/(.*\/)//" catalog_onlyurls > catalog_onlynames.txt
# GenerateKnownArchives.html will go through all the files in catalog_onlynames and generate pseudo file json objects for each
# The map of all filename->jsonstring is downloaded as knownArchives.js
#firefox GenerateKnownArchives.html

#mv ~/Downloads/knownArchive.js ../www/js/lib/

# Cleanup
#find . -size 88c -exec rm {} \;
#rm catalog_onlynames.txt
#rm catalog_onlyurls
#rm catalog.xml