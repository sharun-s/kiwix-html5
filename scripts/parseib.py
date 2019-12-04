from bs4 import BeautifulSoup
import sys

html=  sys.stdin.read()
soup = BeautifulSoup(html, features="html.parser")

def textfrom(soup):
	# kill all script and style elements
	#for script in soup(["script", "style"]):
	#    script.extract()    # rip it out
	table = soup.find('table', class_='infobox')
	text = ''
	exceptional_row_count = 0
	for tr in table.find_all('tr'):
		if tr.find('th'):
			text = text + tr.find('th').get_text()
			if tr.find('td'): 
				text= text+ " " + tr.find('td').get_text() + "\n"
			else:
				text=text+"\n"
	return text

#print(sys.argv[1])
if soup.title.string == sys.argv[1]:
	print(textfrom(soup))
else:
	print("Sorry found "+soup.title.string)	
