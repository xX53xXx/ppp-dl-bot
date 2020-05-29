## IMPORTANT: This project is doing its job now, but it is still in development. (Alpha Release State)

# ppp-dl-bot
Download videos (also newest videos only on rerun) from p-p-p.tv.

## IMPORTANT: This downloader downloads the video stream, because the max ammount of downloads per day is hard limited. So the downloaded video files are in a bad *.TS format.
A converter, which converts this file in usefull and nice *.mp4 format is cooming soon. I decided to separate converter and downloader, 
because it is possible to let the downloader run over night on a weak system and run multiple converter processes on different systems at the same time. (Thats how i will design the converter software).
- The converter software will basicly do this: `ffmpeg -i <video-name>.TS -c:a aac -c:v h264 -preset veryslow -level 6.2 <video-name>.mp4`, so you can get FFMPEG and do it yourself.

# How to use
 - [Install Node](https://nodejs.org/) (Any one of the two suggested versions should work)
 - [Install Yarn](https://classic.yarnpkg.com/en/docs/install/)
 - [Install Git](https://www.linode.com/docs/development/version-control/how-to-install-git-on-linux-mac-and-windows/)
 - Open a terminal window (Windows: Press Windows + R => Type `cmd` => Press Enter, Linx/Mac: look yourself :))
 - In the terminal window:
    -  Navigate to the location you want to checkout the project (Windows: cd %USERPROFILE%\Documents, Linx/Mac: look yourself :))
    -  Checkout project: Run `git clone https://github.com/xX53xXx/ppp-dl-bot.git`
    -  Enter the projects dir: Run `cd ppp-dl-bot`
    -  Copy `dev.settings.json` to `settings.json` and edit `settings.json` (Put in your credentials and destination directory)
    -  Run `yarn install` in project dir
    -  Run `yarn start` in project dir // Run `yarn start --unmute` to start downloader unmuted

# Changelog
## 0.0.1
- Feature: Login.
- Feature: Check current maximum amount of videos.
- Feature: Run from 1 to current ammount of videos and check if thay are in the database file with the downloadStatus `done`.
  - Skip if downloadStatus is `done`
  - Start video download otherwise
- Feature: Save state in a databse JSON file.
- Feature: Settings file which can hold user credentials for auto login.

# Chears
## Author: xX53xXx