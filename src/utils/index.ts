import { BrowserWindow, ipcMain, Event } from 'electron';
import { readFileSync, writeFileSync, existsSync, PathLike, mkdirSync, openSync, writeSync, closeSync, renameSync, unlinkSync, copyFileSync } from 'fs';
import formatDate from 'date-fns/format';
import sanitize from 'sanitize-filename';
import ping from 'ping';
import axios from 'axios';
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
    // StoreVideoData,
    StartVideoDownload
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
            settings[settingsFilePath].videoPartTimeout = 5;
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

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
let _isDownloading = false;
export async function downloadVideo(videoId: number, oldVideo?: VideoFile): Promise<VideoFile|null> {
    if (_isDownloading) {
        console.error('Broken!!!!');
        return null;
    }

    const settings = useSettings();
    const toutTime: number = settings.videoPartTimeout! * 1024;
    const ts = new Date();
    
    mkdirSync(settings.tempDir!, { recursive: true });

    const fileName = formatDate(ts, 'T') + '.TS';
    const filePath = path.join(settings.tempDir!, fileName);

    return new Promise<VideoFile|null>(async (resolve, _) => {
        try {
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

            const fin = () => {
                closeSync(fh);
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

                _isDownloading = false;

                resolve(videoMeta);
            };

            let timeout = setInterval(() => {
                fin();
            }, toutTime);

            
            regEventOnce(StartVideoDownload, async url => {
                if (_isDownloading) {
                    return;
                } else {
                    _isDownloading = true;
                }

                clearTimeout(timeout);

                console.log(url);

                const mt = /^(https:\/\/.+?mp4:.+?\/media_.+?_)(\d+)(\.ts)$/ig.exec(url);

                if (mt) {
                    let run = true;
                    let id = parseInt(mt[2], 10);

                    do {
                        try {
                            while (!await hasInternet()) {
                                process.stdout.write('No internet, waiting ...\r');
                                await new Promise((r, _) => setTimeout(r, 2048));
                            }

                            
                            process.stdout.write('Downloading part: ' + id + '                                                                 \r');
                            const rsp = await axios.get(`${mt[1]}${id}${mt[3]}`, { responseType: 'arraybuffer', timeout: 4096 });
                            
                            
                            if (rsp.data) {
                                writeSync(fh, new Uint8Array(rsp.data));
                                videoMeta.downloadStatus = 'downloading';
                                id++;
                                await new Promise((r, _) => setTimeout(r, 256)); // Wait to prevent ddos on service and let system finish up writing job
                            } else {
                                run = false;
                            }
                        } catch (err) {
                            if (!err) continue;

                            if (err.code && err.code.toUpperCase() !== 'ETIMEDOUT') {
                                let internetError: boolean = false;

                                while (!await hasInternet()) {
                                    internetError = true;
                                    process.stdout.write('No internet, waiting ...\r');
                                    await new Promise((r, _) => setTimeout(r, 2048));
                                }

                                if (!internetError) {
                                    run = false;
                                }
                            } else if (err.code && err.code.toUpperCase() === 'ETIMEDOUT') {
                                process.stdout.write('Bad internet, waiting ...\r');
                            } else if (err.response.status === 404) {
                                run = false;
                            } else {
                                console.error('Error: Unknown error, repeating...', err, filePath);
                            }
                        }
                    } while (run);
                    
                    fin();
                }
            });

            console.log(`Downloading ${videoMeta.id}#"${videoMeta.name}" ...`);
        } catch (err) {
            console.error(err);
            _isDownloading = false;
            return null;
        }
    });
}

export async function hasInternet(testHost: string = 'p-p-p.tv'): Promise<boolean> {
    return new Promise<boolean>((resolve, _) => {
        ping.sys.probe(testHost, isAlive => {
            resolve(isAlive);
        });
    });
}

export function getFileName(filePath: string): string {
    return filePath.replace(/^.*[\\\/]/g, '');
}