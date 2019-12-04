from bs4 import BeautifulSoup
import sys

html=  sys.stdin.read()
soup = BeautifulSoup(html, features="html.parser")

def textfrom(soup):
	# kill all script and style elements
	#for script in soup(["script", "style"]):
	#    script.extract()    # rip it out
	# get text
	text = soup.body.get_text()

	# break into lines and remove leading and trailing space on each
	lines = (line.strip() for line in text.splitlines())
	# break multi-headlines into a line each
	chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
	#remove dups and preserve order
	seen = set()
	result = []
	for item in chunks:
		if item not in seen:
			seen.add(item)
			result.append(item)
	# drop blank lines
	text = '\n'.join(chunk for chunk in result if chunk)
	return text

#print(sys.argv[1])
if soup.title.string == sys.argv[1]:
	print(textfrom(soup))
else:
	print("Sorry found "+soup.title.string)	

def textfrom_v2(soup):
	return ''.join(BeautifulSoup(html, "html.parser").stripped_strings)

#print(clean_text)