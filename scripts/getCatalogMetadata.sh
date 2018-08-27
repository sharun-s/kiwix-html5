#download catalog
curl -L http://library.kiwix.org/catalog/root.xml | xml2 > catalog.xml

#extract just the download links
grep -oP "/feed/entry/link/@href\=.*\.meta4" catalog.xml | cut -d"=" -f2 | rev| cut -c7- | rev > catalog_onlyurls

#download first 88 bytes of all files
#WARNING: This takes time!!!
xargs -a catalog_onlyurls -I{} echo "curl -L {} | dd bs=1 count=88 of={}"| sed -E "s/(of=).*\//\1/" | bash

#run pseudoFileObjectCreator and update knownArchives
