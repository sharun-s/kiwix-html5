from bs4 import BeautifulSoup
import sys
html=  sys.stdin.read()
soup = BeautifulSoup(html, features="html.parser")
flatten = lambda l: [item for sublist in l for item in sublist]
def textfrom(soup):
	# kill all script and style elements
	#for script in soup(["script", "style"]):
	#    script.extract()    # rip it out
	# get text
	text = soup.body.find_all('li', recursive=True)
	print("found %d" % len(text))
	lines = [i.text.strip() for i in text]
	lines = [i.splitlines() for i in lines]
	lines = flatten(lines)
	lines = [i.strip() for i in lines]
	# remove dups
	seen = set()
	result = []
	for item in lines:
		if item not in seen:
			seen.add(item)
			result.append(item)
	return "\n\n".join(result)

#print(sys.argv[1])
if soup.title.string == sys.argv[1]:
	print(textfrom(soup))
else:
	print("Sorry found "+soup.title.string)	
