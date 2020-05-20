import { app, BrowserWindow, ipcMain, Event } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as filenamify from 'filenamify';


import { URL } from './consts';
import { CrossPagesEvent, CrossPagesStorage } from './consts/events';
import { authenticate, $regWindow, sendEvent, regEvent } from './utils';

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

let _crossPageProcesses: any = {};
regEvent(CrossPagesStorage, (_processes) => {
    console.log('Hold: ', _processes);
    _crossPageProcesses = _processes;
});

regEvent(CrossPagesEvent, () => {
    sendEvent(CrossPagesEvent, _crossPageProcesses);
});


async function run(window: BrowserWindow) {
    console.log('Hallo Welt');
    await authenticate();
}