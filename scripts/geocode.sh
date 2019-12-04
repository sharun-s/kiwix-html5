zimdump -f "$1" -p -t /home/s/kiwix-html5/www/wikipedia_en_all_2016-12.zim | head -n7 | tail -1 | sed 's/.*content="\(.*\)".*/\1/'
