import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { mkdirSync } from 'fs';
import { URL } from './consts';
import { authenticate, $regWindow, regEvent, getLastVideoId, useDatabase, useSettings, downloadVideo } from './utils';
import { PageStructureError } from './consts/events';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

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

        console.warn('IMPORTANT: The *.TS files are in a bad codec. Use the converter "yarn convert" to convert videos to a usefull .mp4 codec.');
        console.log('You can run both in parallel. Run "yarn convert" in a second terminal window/session.');
        console.log('');

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

            for (let i = 0; i < 3; i++) {
                try {
                    const vid = await downloadVideo(id, video);
    
                    if (vid) {
                        database.set(vid, true);
                    }

                    break;
                } catch (err) {
                    if (i >= 2) {
                        console.error('Error: Faild downloading video ' + id + '!', err);
                        console.log('Continue with next.');
                    } else {
                        console.error('Error: Faild downloading video ' + id + '! Retry.');
                    }
                }
            }
            
        }

        console.log('');
        console.warn('IMPORTANT: The *.TS files are in a bad codec. Use the converter "yarn convert" to convert videos to a usefull .mp4 codec.');
        console.log('Done.');
        
        win.close();
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(-2);
    }
}