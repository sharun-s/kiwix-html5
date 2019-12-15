from bs4 import BeautifulSoup
import sys, pprint, unicodedata

html=  sys.stdin.read()
soup = BeautifulSoup(html, features="html.parser")

def textfrom(soup):
	# kill all script and style elements
	#for script in soup(["script", "style"]):
	#    script.extract()    # rip it out
	table = soup.find('table', class_='infobox')
	ib={}
	exceptional_row_count = 0
	for tr in table.find_all('tr'):
		if tr.find('th'):
			key = unicodedata.normalize('NFKD', tr.find('th').get_text()).strip()
			ib[key]=soup.title.string
			if tr.find('td'): 
				val = unicodedata.normalize('NFKD', tr.find('td').get_text()).strip()
				ib[key]=val
	return ib

#print(sys.argv[1])
if soup.title.string == sys.argv[1]:
	pprint.pprint(textfrom(soup))
else:
	print("Sorry found "+soup.title.string)	
