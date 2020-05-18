import { app, BrowserWindow, ipcMain, Event } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as filenamify from 'filenamify';

import { URL } from './consts';
import { authenticate, $regWindow } from './utils';

app.on('ready', () => {
    const win = new BrowserWindow({
        width: 1366,
        height: 768,
        webPreferences: {
            nodeIntegration: true,
            preload: path.join(__dirname, 'injection.js')
        }
    });

    win.loadURL(URL);

    win.setMenu(null);

    win.webContents.openDevTools();

    $regWindow(win);
    run(win);
});

async function run(window: BrowserWindow) {
    console.log('Hallo Welt');

    await authenticate();
}