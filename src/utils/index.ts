import { BrowserWindow, ipcMain, Event } from 'electron';
import { readFileSync, writeFileSync, existsSync, PathLike, mkdirSync, openSync, writeSync, closeSync, renameSync, unlinkSync, copyFileSync } from 'fs';
import formatDate from 'date-fns/format';
import sanitize from 'sanitize-filename';
import * as path from 'path';
import { tmpdir } from 'os';
import { stringify as toQueryArgs } from 'querystring';
import { URL } from '../consts';
import { 
    Settings,
    Database,
    VideoMeta,
    Video as VideoFile
} from '../entities';
import { Home, Params, Logout, VideoGallery, Video } from '../consts/pages';
import {
    Navigate,
    NavigationResponse,
    Authenticate,

    EventParams,
    EventResponseParams,
    GetLastVideoId,
    GetVideoMetaData,
    StoreVideoData
} from '../consts/events';

export function readJsonFile<T>(filePath: PathLike): T {
    if (!existsSync(filePath)) {
        throw new Error(`JSON file "${filePath}" not found.`);
    }
    
    const data: string = readFileSync(filePath, 'utf8');
    return JSON.parse(data) as T;
}

export async function writeJsonFile<T = any>(filePath: PathLike, data: T, format?: boolean): Promise<void> {
    writeFileSync(filePath, JSON.stringify(data, null, format? 2 : undefined), 'utf-8');
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
        
        if (!settings[settingsFilePath].tempDir) {
            settings[settingsFilePath].tempDir = tmpdir();
        }

        if (!settings[settingsFilePath].videoPartTimeout) {
            settings[settingsFilePath].videoPartTimeout = 30;
        }
    }

    return settings[settingsFilePath];
}

let database: Database|null = null;
export function useDatabase(forceReload?: boolean): Database {
    if (!database || forceReload) {
        database = new Database();
    }

    return database;
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

export async function getVideoMetaData(videoId: number): Promise<VideoMeta|null> {
    await navigate(Video, { id: videoId });

    return new Promise<VideoMeta|null>((resolve, _) => {
        regEventOnce(GetVideoMetaData, metaData => {
            if (metaData && metaData.name && metaData.name.length > 0) {
                resolve(metaData);
            }
            
            resolve(null);
        });

        sendEvent(GetVideoMetaData, videoId);
    });
}

export async function downloadVideo(videoId: number, oldVideo?: VideoFile): Promise<VideoFile|null> {
    const settings = useSettings();
    const toutTime: number = settings.videoPartTimeout! * 1024;
    const ts = new Date();
    mkdirSync(settings.tempDir!, { recursive: true });

    const fileName = formatDate(ts, 'T') + '.TS';
    const filePath = path.join(settings.tempDir!, fileName);

    return new Promise<VideoFile|null>(async (resolve, reject) => {
        const metaData = await getVideoMetaData(videoId);

        if (!metaData) {
            resolve(null);
            return;
        }

        const readyFileName = sanitize(metaData?.name!, {
            replacement: (_: string) => {
                return '-';
            }
        }).replace(/\ +/g, ' ').replace(/\-+/g, '-').trim() + '.TS';
        const videoMeta: VideoFile = {
            ...metaData,
            downloadStatus: 'init',
            path: './' + readyFileName
        } as VideoFile;

        const finalPathName = path.join(settings.downloadsDir, readyFileName);

        const fh = openSync(filePath, 'ax');

        let timeout: NodeJS.Timeout|null = null;

        const fin = () => {
            closeSync(fh);
            ipcMain.removeAllListeners(StoreVideoData);

            if (videoMeta.downloadStatus === 'downloading') {
                videoMeta.downloadStatus = 'done';
                try {
                    renameSync(filePath, finalPathName);
                } catch {
                    copyFileSync(filePath, finalPathName);
                    unlinkSync(filePath);
                }
                
            } else {
                videoMeta.downloadStatus = 'broken';
                unlinkSync(filePath);
            }

            console.log(`Download done for ${videoMeta.id}#"${videoMeta.name}" -> ${videoMeta.downloadStatus}`);

            resolve(videoMeta);
        };

        const tick = async (data?: ArrayBuffer) => {
            clearTimeout(timeout!);
            if (data && data.byteLength > 0) {
                videoMeta.downloadStatus = 'downloading';
                timeout = setTimeout(fin, toutTime);
            } else {
                timeout = setTimeout(fin,  oldVideo?.downloadStatus === "broken" ? 5000 : toutTime);
            }
        };

        regEvent(StoreVideoData, ({ data }) => {
            tick(data);
            writeSync(fh, new Uint8Array(data));
        });

        tick();

        console.log(`Downloading ${videoMeta.id}#"${videoMeta.name}" ...`);
    });
}

export function getFileName(filePath: string): string {
    return filePath.replace(/^.*[\\\/]/g, '');
}