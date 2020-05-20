import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { mkdirSync } from 'fs';
import { URL } from './consts';
import { authenticate, $regWindow, regEvent, getLastVideoId, useDatabase, useSettings, getVideoMetaData, downloadVideo } from './utils';
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
    // win.webContents.openDevTools();

    await win.loadURL(URL);

    $regWindow(win);
    run(win);
});

regEvent(PageStructureError, message => {
    console.error(`PageStructureError: ${message}. Code update required!`);
    // process.exit(-1);
});

async function run(window: BrowserWindow) {
    try {
        mkdirSync(useSettings().downloadsDir, { recursive: true });

        await authenticate();
        const lastVideoId = await getLastVideoId();

        const database = useDatabase();
        
        for (let id = 1; id <= lastVideoId; id++) {
            const video = database.get(id);

            if (video && video.status === 'completed') {
                console.log(`Info: Video#${id} skipped.`);
                continue;
            }

            const metaData = await getVideoMetaData(id);

            console.log(metaData);
            
            /*if (metaData) {
                const video = await downloadVideo(metaData);
            } else {
                database.set({
                    id,
                    status: 'broken'
                });
            }*/
        }

    } catch (err) {
        console.error(err);
        // process.exit(-2);
    }
}