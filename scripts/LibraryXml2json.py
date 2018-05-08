from bs4 import BeautifulStoneSoup
# TODO: get library.xml from download.kiwix.org/library/library.xml
f=open(r'library.xml')
l = f.read();
f.close()
soup = BeautifulStoneSoup(l)
import re, json
# just get the most recent or there will be thousands of entries
r  = re.compile("2018.*|2017.*")
#books = soup.findAll("book", {"date": r})
#len(books) 1826
# filter for english
books = soup.findAll("book", {"date": r, "language": "eng"})
# books[0].attrs.keys()
#['publisher', 'mediaCount', 'description', 'language', 'creator', 'url', 'title', 'favicon', 'articleCount', 'date', 'faviconMimeType', 'id', 'size']
mybooks = []
for i in books:
	obj = {}
	for a in i.attrs:
		obj[a] = i[a]
	mybooks.append(obj)
print "found " + str(len(mybooks))

# find common favicons - this reduces the size of the json object as the favicon strings can be large and repeat multiple times
icons = {}
for i in mybooks:
        if i['favicon'] in icons:
                icons[i['favicon']].append(i['url'])
        else:
                icons[i['favicon']] = [i['url']]
# get filename from url, break it by _, find the common pieces across all sets of pieces sharing same favicon - use that as key to icon list
namedicons = {}
for i in icons:
        # remove .zim.meta4 and  - and . from the url and slit it apart on _
        bu=[]
        for k in icons[i]:
                u = k.split('/')[-1][:-10].replace("-","")
                u = u.replace(".","")
                bu.append(u.split('_'))
        if len(bu) > 1 :
                key = "_".join(sorted(set(bu[0]).intersection(*bu[1:]),  reverse=True) )
        else:
                key =  "_".join(sorted(bu[0], reverse=True))
        namedicons[ key ] = i
        icons[i] = key

f = open('icons.json', "w")
json.dump(namedicons, f )
f.close()
f = open('library.json', "w")
for i in mybooks:
        #assert( namedicons[icons[i['favicon']]] == i['favicon'], "crumbs")
        i['favicon'] = "icons."+icons[i['favicon']]
json.dump(mybooks, f)
f.close()
f = open('library.json', "r")
line = f.read()
f.close()
# remove quotes
f = open('library.json', "w")
line = re.sub(r'"favicon": "(.*?)"', r'"favicon": \1', line)
#re.sub(r'"favicon": "(.*?)",', r'"favicon": \1,', line)
f.write(line)
f.close()
