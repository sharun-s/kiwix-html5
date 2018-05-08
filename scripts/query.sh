#!/bin/bash
usage() { echo -e "Usage: $0 [-i|u] [-x] ARCHIVE KEYWORD\n \
\t If just Keyword provided, query runs over the title index [i.e. title search]\n \
\t-i [image url search] query over url index ignoring articles and redirects\n \
\t-u [url search] query over url index\n
\t-x just prints query output without opening browser" 1>&2; exit 1; }

#KEYWORD=$1
#ARCHIVE=$2
QUERY="select cluster, blob, namespace, url from "
IDX=0
BROWSERPATH='C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe'
KIWIXPATH='file:///C:/<some path>/www/index.html'
while getopts "i|ux" opt; do 
	#echo $opt $OPTARG $OPTIND
	case "${opt}" in
		u) IDX=1
			;; 
		i) IDX=2
			;;
		x) x=1
			;;
		*) echo "def case";; 
	esac
done

#echo "key:${KEYWORD} optind:${OPTIND}"
shift $((OPTIND-1))
ARCHIVE=$1
KEYWORD=$2
#echo "key:${ARCHIVE} ${KEYWORD} optind:${OPTIND}"
CLAUSE=(
	"where redirect='false' and title like '$KEYWORD' limit 1"
	"where redirect='false' and url like '%$KEYWORD%' limit 1"
	"where namespace!='A' and redirect='false' and url like '$KEYWORD' limit 1"
	)

#if no keyword specified exit
if [ -z "${KEYWORD}" ]; then
	usage;
else
	QUERY="${QUERY}${ARCHIVE} ${CLAUSE[$IDX]}";
fi
echo "${QUERY}"
if [ $x ]; then  
./sqlite3.exe ${ARCHIVE}.db "${QUERY}" | awk -v ar="$ARCHIVE" -F '|' '{ printf "archive=%s&c=%s&b=%s&n=%s&url=%s",ar,$1,$2,$3,$4 }' ;
else
./sqlite3.exe "${ARCHIVE}".db "${QUERY}" | awk -v ar="$ARCHIVE" -v bp="$BROWSERPATH" -v kp="$KIWIXPATH" -F '|' '{ printf "\"%s\" -url \"%s?archive=%s&c=%s&b=%s&n=%s&url=%s\"",bp,kp,ar,$1,$2,$3,$4 }' | sh ;
fi
exit 0
