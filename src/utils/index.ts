import { BrowserWindow, ipcMain, Event } from 'electron';
import { readFileSync, existsSync, PathLike } from 'fs';
import { URL } from '../consts';
import { Settings } from '../entities';
import { Home, Params } from '../consts/pages';
import { Navigate } from '../consts/events';

export function readJsonFile<T>(filePath: PathLike): T {
    if (!existsSync(filePath)) {
        throw new Error(`JSON file "${filePath}" not found.`);
    }
    
    const data: string = readFileSync(filePath, 'utf8');
    return JSON.parse(data) as T;
}

let browserWindow: BrowserWindow|null = null;
export function $regWindow(window: BrowserWindow) {
    browserWindow = window;
}

export function useWindow(): BrowserWindow {
    if (browserWindow === null) {
        throw new Error('No browser window registrated. Use "$regWindow" to registrate an initialized browser window.');
    }

    return browserWindow;
}

const settings: { [filePath: string]: Settings; } = {};
export function useSettings(settingsFilePath: string = './settings.json'): Settings {
    if (!settings[settingsFilePath]) {
        settings[settingsFilePath] = readJsonFile<Settings>(settingsFilePath);
    }

    return settings[settingsFilePath];
}

// ---

export async function navigate<PageName extends keyof Params>(page: PageName, args?: Params[PageName]): Promise<Location> {
    useWindow().webContents.send(Navigate, { url: (URL + '/' + page).replace(/\/+/g, '/') });
    
    return new Promise((resolve, reject) => {
        try {
            ipcMain.once(Navigate, (_: any, location: Location) => {
                resolve(location);
            });
        } catch (error) {
            reject(error);
        }
    });
}

export async function authenticate() {
    console.log('Start navigation.');
    const location = await navigate(Home);
    console.log('Stop navigation.', location);
}