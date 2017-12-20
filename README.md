This is a fork of the [Kiwix-js](https://github.com/kiwix/kiwix-js) project.

The focus is "Standalone" mode. 
In this mode all you need to read and search an **offline** full archive of web content (Wikipedia/Stackoverflow/KhanAcademy etc) is a browser.

The funda being, web content just requires a webbrowser. No app/app market access/browser extension/local server/remote server required.

The advantage over apps is URL functionality works out of the box. Things involving URL's don't require new features to be built into an app.
So functionality such as bookmarking links, sharing links, open link in new tab, get image link etc are available to the user.

The web content archive must be in the ZIM file format.

Simplest way to see URL mode in action:
Download the code - unzip - click index.html - press the info button - click on the test archive link
URL's to any article/search resultset can be opened directly.

STEPS [to load any archive INCOMLETE WIP]

1. Download the code [here](https://github.com/sharun-s/kiwix-js)  
Unzip to a folder

2. Find and download an offline archive of interest [here](http://www.kiwix.org/downloads/)

3. [Temporary Step due to browser bugs] Split the archive into 50k slices. 
- The split files must be placed in a directory with the same name as that of the downloaded archive.
- The directory with the split files must be placed in the www directory of the app folder
- Slices must be named numerically.
Example:
$ split -a 3 -d -b 50k wiktionary_en_simple_all_nopic_2017-01.zim www/wiktionary 
- knownArchives in zimarchiveloader.js must be updated
[TODO] split dependencies

4. Click on index.html to start the app
  
  
**Thats it!** You are ready to start browsing an offline version of Wikipedia.

**NOTE:** This is aimed at only developers conducting experiments on the Kiwix-js repo. As these experiments mature code will be pushed back into the Kiwix-js repo. For stable more time-tested platform-specific versions checkout the main [Kiwix](https://github.com/kiwix) page.       

**Browser Compatibility:**  
This code has been tested on Firefox and Edge.   
For Chrome start the browser with the [--allow-file-access-from-files](https://stackoverflow.com/questions/18586921/how-to-launch-html-using-chrome-at-allow-file-access-from-files-mode) paramater. It's convenient to create a shortcut to Chrome with this option set.    
