KEYWORD=$1
ARCHIVE=$2
QUERY="select cluster, blob from quotes where url like '%$KEYWORD%' limit 1"
BROWSERPATH='C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe'
KIWIXPATH='file:///C:/<some path>/www/index.html'

# echo $QUERY
# replace quotes.db and quotes with $ARCHIVE
./sqlite3.exe quotes.db "${QUERY}" | awk -v bp="$BROWSERPATH" -v kp="$KIWIXPATH" -F '|' '{ printf "\"%s\" -url \"%s?archive=quotes&c=%s&b=%s\"",bp,kp,$1,$2 }' | sh

