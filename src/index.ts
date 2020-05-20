import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { URL } from './consts';
import { authenticate, $regWindow, regEvent, getLastVideoId } from './utils';
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
    win.webContents.openDevTools();

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
        await authenticate();
        const lastVideoId = await getLastVideoId();
        
        for (let id = 1; id <= lastVideoId; id++) {

        }

    } catch (err) {
        console.error(err);
        // process.exit(-2);
    }
}