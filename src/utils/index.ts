import { BrowserWindow, ipcMain, Event } from 'electron';
import { readFileSync, existsSync, PathLike } from 'fs';
import { stringify as toQueryArgs } from 'querystring';
import { URL } from '../consts';
import { Settings } from '../entities';
import { Home, Params } from '../consts/pages';
import {
    Navigate,
    Authenticate,

    EventParams,
    EventResponseParams
} from '../consts/events';

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

function regEvent<EventName extends keyof EventResponseParams>(eventName: EventName, callback: (params: EventResponseParams[EventName], event: Event) => void) {
    ipcMain.on(eventName, (e, p) => callback(p, e));
}

function regEventOnce<EventName extends keyof EventResponseParams>(eventName: EventName, callback: (params: EventResponseParams[EventName], event: Event) => void) {
    ipcMain.once(eventName, (e, p) => callback(p, e));
}

function sendEvent<EventName extends keyof EventParams>(eventName: EventName, params: EventParams[EventName]) {
    useWindow().webContents.send(eventName, params);
}

// ---

export async function navigate<PageName extends keyof Params>(page: PageName, args?: Params[PageName]): Promise<Location> {
    sendEvent(Navigate, (URL + '/' + page).replace(/\/+/g, '/')) + (args ? '?' + toQueryArgs(args) : '');
    
    return new Promise((resolve, reject) => {
        try {
            regEventOnce(Navigate, (location: Location) => {
                resolve(location);
            });
        } catch (error) {
            reject(error);
        }
    });
}

export async function authenticate(): Promise<void> {
    await navigate(Home);
    sendEvent(Authenticate, useSettings().account);

    return new Promise((resolve, reject) => {
        try {
            ipcMain.once(Authenticate, (_: any, value: boolean) => {
                if (value) {
                    resolve();
                } else {
                    reject(new Error('Authentication failed.'));
                }
            });
        } catch (error) {
            reject(error);
        }
    });
}