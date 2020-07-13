import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { mkdirSync } from 'fs';
import { URL } from '../consts';
import { authenticate, $regWindow, regEvent, getLastVideoId, useSettings, downloadVideo, onPanicCleanup } from '../utils';
import { PageStructureError } from '../consts/events';

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

regEvent(PageStructureError, (message: string) => {
    console.error(`PageStructureError: ${message}. Code update required!`);
    process.exit(-1);
});

async function run(win: BrowserWindow) {
    try {
        const settings = await useSettings();

        mkdirSync(settings.downloadsDir, { recursive: true });

        await authenticate();
        const lastVideoId = await getLastVideoId();

        console.log(lastVideoId);

    } catch (err) {
        console.error(err);
        process.exit(-2);
    }
}