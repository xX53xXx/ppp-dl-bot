import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { mkdirSync } from 'fs';
import { URL } from './consts';
import { authenticate, $regWindow, regEvent, getLastVideoId, useSettings, downloadVideo, onPanicCleanup } from './utils';
import { PageStructureError } from './consts/events';
import { getEntry, postEntry } from './utils/client';

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

    win.on('close', () => {
        process.exit();
    });

    win.on('close', onPanicCleanup);
    process.on('beforeExit', onPanicCleanup);
    process.on('exit', onPanicCleanup);
    process.on('SIGKILL', onPanicCleanup);
    process.on('SIGTERM', onPanicCleanup);

    run(win);
});

regEvent(PageStructureError, message => {
    console.error(`PageStructureError: ${message}. Code update required!`);
    process.exit(-1);
});

async function run(win: BrowserWindow) {
    try {

        const settings = await useSettings();

        const ignoreBroken = (process.argv.indexOf('--ignore-broken') > 0);

        console.warn('IMPORTANT: The *.TS files are in a bad codec. Use the converter "yarn convert" to convert videos to a usefull .mp4 codec.');
        console.log('You can run both in parallel. Run "yarn convert" in a second terminal window/session.');
        console.log('');

        mkdirSync(settings.downloadsDir, { recursive: true });

        await authenticate();
        const lastVideoId = await getLastVideoId();
        
        for (let id = 1; id <= lastVideoId; id++) {
            const video = await (await getEntry(id)).data;

            console.log(video);
            break;
        }

        /*
        for (let id = 1; id <= lastVideoId; id++) {
            const video = await (await getEntry(id)).data;

            if (video && video.downloadStatus === 'done') {
                console.log(`Info: ${id}#"${video.name}" is done -> skipped`);
                continue;
            }

            if (ignoreBroken && video && video.downloadStatus === 'broken') {
                if (video.name) {
                    console.log(`Info: ${id}#"${video.name}" is broken -> skipped`);
                } else {
                    console.log(`Info: ${id} is broken -> skipped`);
                }
                
                continue;
            }

            for (let i = 0; i < 3; i++) {
                try {
                    const vid = await downloadVideo(id, video);
    
                    if (vid) {
                        await postEntry(vid);
                    } else {
                        await postEntry({
                            id,
                            downloadStatus: 'broken'
                        });
                        console.log(`Info: ${id}# is broken.`);
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
        console.log('');
        
        let timeLeft = 30;
        let inv = setInterval(() => {
            process.stdout.write('Done. Restart in ' + (timeLeft--) + 's                                                                 \r');
            if (timeLeft <= 0) {
                clearInterval(inv);
                run(win);
            }
        }, 1000);
        */

    } catch (err) {
        console.error(err);
        process.exit(-2);
    }
}