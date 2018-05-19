import sqlite3 as s
import argparse
import webbrowser as wb
import sys 
parser = argparse.ArgumentParser(description='Runs predefined sql queries on zim archive index content')
parser.add_argument('db', help='sqlite3 db (eg: wiki.db)')
parser.add_argument('keyword',help='keyword to lookup (default algo:exact match; use %%keyword%% to match anywhere)')
parser.add_argument('-q', action='store', default='t',choices=['t','u','i'], help='query type=t(title search|default) OR u (url search) OR i (image search)')
parser.add_argument('-b', action="store_true", help='open result in browser')

args = parser.parse_args()
print args
print
appath=r"file:///C:/<path to kiwix-js>"
dbpath=r"C:\<path to to sqlite db containing table or index generated from zim>"
filename=dbpath+args.db
table=args.db[:-3]
index=''

c=s.connect(filename)
cu=c.cursor()
ts.append(time.clock());
search = {'t':"select %s from "+table+" where redirect='false' and title like ? limit 1",
        'u':"select %s from "+table+" where redirect='false' and url like ? limit 1",
        'i':"select %s from "+table+" where namespace!='A' and redirect='false' and url like ? limit 1"}
fields = {'forBrowser':"cluster, blob, namespace, url", 'forShell':"rowid"}

if args.b:
        sql = search[args.q] % fields['forBrowser']
else:
        sql=search[args.q] % fields['forShell']

print "running query: " + sql
print " "
rowid=None
def q(stmt, values):
        for row in cu.execute(stmt, values):
                print row
                print 
                if args.b:
                        print "opening url..."
                        browser=wb.get('C:/Program Files (x86)/Mozilla Firefox/firefox.exe %s')
                        url = appath+"/www/index.html?archive="+table+"&c=%s&b=%s&n=%s&title=%s" % row
                        browser.open(url.encode('utf-8'), 2, autoraise=True)
                else:
                        rowid=long(row[0])
                        print rowid
                        get(rowid)
                return True

def get(idx, limit=5):
  for row in cu.execute('select title,url,rowid from wiki where rowid in (%s)' % ','.join('?'*limit), range(idx, idx+limit)):
    print row[1].encode('utf-8')
##  if 'n'==raw_input("more [n to exit]?"):
##          return
##  else:
##          sys.stdout.flush()
##          get(idx+limit+1)
done = False
if args.q == 't':
        done = q(sql, (args.keyword,))
else:
        # for url based queries currently find keyword anywhere in url string 
        done = q(sql, ('%'+args.keyword+'%',))
if not done:
        print "No records found"

print ts        


##cu.execute(query[0], ("false", "Tintin"))
##assert u'Tintin.html'==cu.fetchone()[0], "#1"
##
##cu.execute(query[0], ("false", "%tintin%"))
##row=cu.fetchone()
##assert 'Aqua_Horological_Tintinnabulator.html'==row[0], "#2"
##
##cu.execute("select title,rowid from wiki where redirect=? and title=? limit 5", ("false", "Tintin"))
##row=cu.fetchone() 
##assert row[0]==u'Tintin', "#3"
##assert row[1]==11600796, "#4"
##
##def get(idx, limit=5):
##  for row in cu.execute('select title,rowid from wiki where rowid in (%s)' % ','.join('?'*limit), range(idx, idx+limit)):
##    print row[0]
##    
##get(11600796)
##get(11600798, 2)






