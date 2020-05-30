import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { mkdirSync } from 'fs';
import { URL } from './consts';
import { authenticate, $regWindow, regEvent, getLastVideoId, useDatabase, useSettings, downloadVideo } from './utils';
import { PageStructureError } from './consts/events';

app.on('ready', async () => {
    const win = new BrowserWindow({
        width: 1366,
        height: 768,
        webPreferences: {
            nodeIntegration: true,
            preload: path.join(__dirname, 'injection/index.js')
        }
    });
    win.setMenu(null);

    if (process.argv.indexOf('--dev-tools') > 0) {
        win.webContents.openDevTools();
    }

    if (!(process.argv.indexOf('--unmute') > 0)) {
        win.webContents.setAudioMuted(true);
    }

    await win.loadURL(URL);

    $regWindow(win);
    run(win);
});

regEvent(PageStructureError, message => {
    console.error(`PageStructureError: ${message}. Code update required!`);
    process.exit(-1);
});

async function run(win: BrowserWindow) {
    try {

        console.warn('IMPORTANT: The *.TS files are in a bad codec. A converter software will be implemented soon.');
        console.warn('You can also use FFMPEG by yourself: ffmpeg -i <video-name>.TS -c:a aac -c:v h264 -preset veryslow -level 6.2 <video-name>.mp4');

        console.log('');

        console.warn('IMPORTANT: Do not seek or navigate! Click protection, fullscreen and unmute cooming soon.');

        mkdirSync(useSettings().downloadsDir, { recursive: true });

        await authenticate();
        const lastVideoId = await getLastVideoId();

        const database = useDatabase();
        
        for (let id = 1; id <= lastVideoId; id++) {
            const video = database.get(id);

            if (video && video.downloadStatus === 'done') {
                console.log(`Info: ${id}#"${video.name}" is done -> skipped`);
                continue;
            }

            const vid = await downloadVideo(id, video);

            if (vid) {
                database.set(vid, true);
            }
        }

        console.warn('IMPORTANT: The *.TS files are in a bad codec. A converter software will be implemented soon.');
        console.warn('You can also use FFMPEG by yourself: ffmpeg -i <video-name>.TS -c:a aac -c:v h264 -preset veryslow -level 6.2 <video-name>.mp4');
        console.log('Done.');
        
        win.close();
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(-2);
    }
}