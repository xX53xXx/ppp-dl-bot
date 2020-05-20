import { BrowserWindow, ipcMain, Event, ipcRenderer } from 'electron';
import { readFileSync, existsSync, PathLike } from 'fs';
import { stringify as toQueryArgs } from 'querystring';
import { URL } from '../consts';
import { Settings } from '../entities';
import { Home, Params, Logout, VideoGallery } from '../consts/pages';
import {
    Navigate,
    NavigationResponse,
    Authenticate,

    EventParams,
    EventResponseParams,
    GetLastVideoId
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

export function regEvent<EventName extends keyof EventResponseParams>(eventName: EventName, callback: (params: EventResponseParams[EventName], event: Event) => void) {
    ipcMain.on(eventName, (e, p) => callback(p, e));
}

export function regEventOnce<EventName extends keyof EventResponseParams>(eventName: EventName, callback: (params: EventResponseParams[EventName], event: Event) => void) {
    ipcMain.once(eventName, (e, p) => callback(p, e));
}

export function sendEvent<EventName extends keyof EventParams>(eventName: EventName, params?: EventParams[EventName]) {
    useWindow().webContents.send(eventName, params);
}

// ---

export async function navigate<PageName extends keyof Params>(page: PageName, args?: Params[PageName]): Promise<NavigationResponse> {
    const url = (URL + '/' + page).replace(/\/+/g, '/') + (args ? '?' + toQueryArgs(args) : '');

    try {
        const rsp = await Promise.all([
            new Promise<NavigationResponse>((resolve, _) => {
                regEventOnce(Navigate, rsp => {
                    resolve(rsp);
                });
            }),
            useWindow().loadURL(url)
        ]);

        return rsp[0];
    } catch (error) {
        throw error;
    }
}

export async function authenticate(): Promise<void> {
    const credentials = useSettings().account;
    const rsp = await navigate(Home);

    if (rsp.username) {
        if (rsp.username.toLowerCase() === credentials.username.toLowerCase()) {
            return;
        } else {
            await navigate(Logout);
            await navigate(Home);
        }
    }

    return new Promise((resolve, reject) => {
        regEventOnce(Navigate, rsp => {
            if (rsp.username && rsp.username.toLowerCase() === credentials.username.toLowerCase()) {
                resolve();
            } else {
                reject(new Error('Authentication failed!'));
            }
        });

        sendEvent(Authenticate, credentials);
    });
}

export async function getLastVideoId(): Promise<number> {
    await navigate(VideoGallery);

    await new Promise((resolve, _) => setTimeout(resolve, 1024));

    return new Promise<number>((resolve, _) => {
        regEventOnce(GetLastVideoId, id => {
            resolve(id);
        });

        sendEvent(GetLastVideoId);
    });
}

export async function getVideoMetaData(videoId: number): Promise<any|null> {

}