# ppp-dl-bot
Download videos from p-p-p.tv. It uses the video stream not the download link to avoid the 1/day limitation.

# How to use
 - [Install Node](https://nodejs.org/) (Any one of the two suggested versions should work)
 - [Install Yarn](https://classic.yarnpkg.com/en/docs/install/)
 - [Install Git](https://www.linode.com/docs/development/version-control/how-to-install-git-on-linux-mac-and-windows/)
 - For the converter:
   - [Install FFMPEG](https://www.ffmpeg.org/download.html)
 - Open a terminal window (Windows: Press Windows + R => Type `cmd` => Press Enter, Linx/Mac: look yourself :))
 - In the terminal window:
    -  Navigate to the location you want to checkout the project
       -  (Windows: cd %USERPROFILE%\Documents, Linx/Mac: look yourself :))
    -  Checkout project: Run `git clone https://github.com/xX53xXx/ppp-dl-bot.git`
    -  Enter the projects dir: Run `cd ppp-dl-bot`
    -  Copy `dev.settings.json` to `settings.json` and edit `settings.json`
       -  (Put in your credentials and destination directory)
    -  Run `yarn install` in project dir
    -  Run `yarn start` in project dir // Run `yarn start --unmute` to start downloader unmuted
       -  Still need to download all videos and after it close the downloader service befor continue. (Database management service useage for the downloader cooming soon)
    -  Run `yarn service` after downloads are finished to start the database management service.
    -  Run `yarn convert` in a second command line window to start the converter process. (Make shure you have configured your `settings.json` correct)
       -  Info: Multiple converter instances are allowed and should work finally (Test in progress)

# Settings documentation
Documentation which possibilities you have in the `settings.json` file.
```js
{
    "account": { // (Required)
        "username": "", // (Required) Your username    You credentials are save if you use my code. You can look through the code, there is no backdor or sth. like that.
        "password": "" // (Required) Your password     No warranty if you use code from a fork. Take care not to push your credentials. settings.json is per default in .gitignore
    },

    "serviceUrl": "http://192.168.1.2:5335", // (Required) Which database management service to use. (one of the in ethernet accessible ip addresse the service prints on start)
    "service": { // (Optional) Service settings
      "port": 5335, // (Optional) Port where the service has to listen on, default is 5335

      // If both, public and private key are set https instead of http will be used.
      "certificate": "./secret/pub.crt", // (Optional) Public key for https useage instead of http (may be a file path or the file content as string)
      "privateKey": "./secret/private.key", // (Optional) Private key for https useage instead of http (may be a file path or the file content as string)
    },

    "downloadsDir": "./out", // (Required) Where to store the downloaded files
    "videoPartTimeout": 10, // (Optional) Time in seconds how long to wait for the initial video stream befor the video gets the status 'broken' and the download continues with the next
   
   "converter": { // (Optional)
        "dropDir": "./temp", // (Optional) Where to move the not required files after converting process. If null, the files will be deleted.
        "ffmpegPath": "" // (Optional) The path to the ffmpeg programm on your system. If not set, that one in the PATH env var will be used.
    }
}
```

# Changelog
## 2.0.0-alpha
  - Database management service implemented
  - Converter process changed to work with database management service
## 1.0.1
  - Download mechanism slightly improved. Downloaded packages directly stored into file.
    - Less RAM useage
    - Faster write to file speed (not really but there is no pause to write downloaded packages to the file, this pause is broken apart)
  - Bugfix: Converter and downloader sync fixed. Now multiple converters and !!one!! downloader processes can run at the same time.
  - Bugfix: Auto relogin implemented to prevent false positives.
  - Bugfix/Feature: After all downloads are done, the queue is restartet to retry false positives.
  
## 1.0.0
- Download mechanisum hard changed.
  - Download speed super duper hard improved.
  - Download stability hard improved.
  - Pause/Resume download on internet failures implemented.
- Converter full implemented. (beta state)
  - Supports converting while downloads are in progress.
  - Supports multi machine converting in parallel.
  - Watches out for new files to convert if converting process is faster than download.
- Stability improved.
- Temp dir useage set to be deprecated. (Maybe will be removed in the future)
- Bugfix: Sometimes the videos ware not downloaded in full length.
- Bugfix: Crash on moving the video from temp dir to destination dir if both dirs are on different partitions or drives.
  
## 0.0.1
- Feature: Login.
- Feature: Check current maximum amount of videos.
- Feature: Run from 1 to current ammount of videos and check if thay are in the database file with the downloadStatus `done`.
  - Skip if downloadStatus is `done`
  - Start video download otherwise
- Feature: Save state in a databse JSON file.
- Feature: Settings file which can hold user credentials for auto login.

# Chears
### Author: xX53xXx
