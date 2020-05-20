import { BrowserWindow, ipcMain, Event, DownloadItem, WebContents } from 'electron';
import { readFileSync, writeFileSync, existsSync, PathLike, stat } from 'fs';
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
    DownloadVideo
} from '../consts/events';
// @ts-ignore
import sanitize from 'sanitize-filename';
import * as path from 'path';

export function readJsonFile<T>(filePath: PathLike): T {
    if (!existsSync(filePath)) {
        throw new Error(`JSON file "${filePath}" not found.`);
    }
    
    const data: string = readFileSync(filePath, 'utf8');
    return JSON.parse(data) as T;
}

export async function writeJsonFile<T = any>(filePath: PathLike, data: T): Promise<void> {
    writeFileSync(filePath, JSON.stringify(data), 'utf-8');
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

let database: Database|null = null;
export function useDatabase(): Database {
    if (!database) {
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
            resolve(metaData);
        });

        sendEvent(GetVideoMetaData, videoId);
    });
}

export async function downloadVideo(videoMeta: VideoMeta): Promise<VideoFile> {
    const database = useDatabase();

    return new Promise<VideoFile>((resolve, _) => {
        useWindow().webContents.session.once('will-download', async (e: Event, item: DownloadItem, webContents: WebContents) => {
            const fileName: string = sanitize(videoMeta.name!) + '.mp4';
            const video: VideoFile = {
                ...videoMeta,
                path: path.join(useSettings().downloadsDir, fileName),
                status: 'prepared'
            };

            database.set(video);

            item.setSavePath(video.path!);

            item.on('updated', async (e, state) => {
                const oldVideoState = video.status;

                switch (state) {
                    case 'interrupted':
                        video.status = 'interrupted';
                        console.log(`Video download of '${video.path}' interrupted.`);
                        (e as any).sender._events.done();
                        break;

                    case 'progressing':
                        if (item.isPaused()) {
                            video.status = 'paused';
                            console.log(`Video download of '${video.path}' paused.`);
                        } else {
                            video.status = 'progressing';
                        }
                        break;

                    default:
                        console.warn(`Unknown downloading state '${state}'.`);
                        break;
                }

                if (oldVideoState !== video.status) {
                    database.save();
                }
            });

            item.once('done', async (e, state) => {
                const oldVideoState = video.status;
                
                switch (state) {
                    case 'completed':
                        video.status = 'completed';
                        console.log(`Video download of '${video.path}' completed.`);
                        break;
                        
                    default:
                        video.status = 'failed';
                        console.log(`Video download of '${video.path}' failed // ${state}.`);
                        break;
                }

                if (oldVideoState !== video.status) {
                    database.save();
                }

                resolve(video);
            });
        });

        sendEvent(DownloadVideo, videoMeta);
    });
}