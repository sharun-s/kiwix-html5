zimdump -f "$1" -p -t /home/s/kiwix-html5/www/wikiquote_en_all_nopic_2018-06.zim | python3 parsequotes.py "$1"