import { BrowserWindow, ipcMain, Event } from 'electron';
import { readFileSync, writeFileSync, existsSync, PathLike, mkdirSync, openSync, writeSync, closeSync, unlinkSync } from 'fs';
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
    StartVideoDownload
} from '../consts/events';

export async function readJsonFile<T>(filePath: PathLike): Promise<T> {
    if (!existsSync(filePath)) {
        throw new Error(`JSON file "${filePath}" not found.`);
    }

    const data: string = readFileSync(filePath, 'utf8');
    return JSON.parse(data) as T;
}

export async function writeJsonFile<T = any>(filePath: PathLike, data: T, format?: boolean): Promise<void> {
    writeFileSync(filePath, JSON.stringify(data, null, format ? 2 : undefined), 'utf-8');
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
export async function useSettings(settingsFilePath: string = './settings.json'): Promise<Settings> {
    if (!settings[settingsFilePath]) {
        settings[settingsFilePath] = await readJsonFile<Settings>(settingsFilePath);
        
        if (!settings[settingsFilePath].tempDir) {
            settings[settingsFilePath].tempDir = tmpdir();
        }

        if (!settings[settingsFilePath].videoPartTimeout) {
            settings[settingsFilePath].videoPartTimeout = 10;
        }
    }

    return settings[settingsFilePath];
}

let database: Database|null = null;
export async function useDatabase(forceReload?: boolean, databaseFileName: string = 'db.json'): Promise<Database> {
    if (!database || forceReload) {
        const settings = await useSettings();
        database = new Database(path.join(settings.downloadsDir, databaseFileName));
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
    const settings = await useSettings();
    const credentials = settings.account;
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
    const rsp = await navigate(Video, { id: videoId });

    if (rsp.location.pathname === '/login.php') {
        await authenticate();
        await navigate(Video, { id: videoId });
    }

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

export function title2fileName(title: string): string {
    return sanitize(title, {
        replacement: (_: string) => {
            return '-';
        }
    }).replace(/\ +/g, ' ').replace(/\-+/g, '-').trim();
}

export async function downloadVideo(videoId: number, oldVideo?: VideoFile): Promise<VideoFile|null> {
    const settings = await useSettings();
    const window = useWindow();
    const toutTime: number = settings.videoPartTimeout! * 1024;
    
    mkdirSync(settings.downloadsDir!, { recursive: true });

    return new Promise<VideoFile|null>((resolve, reject) => (async () => {
        try {
            await waitForInternet()

            const metaData = await getVideoMetaData(videoId);

            if (!(metaData && metaData.name && metaData.name.length > 0)) {
                resolve(null);
                return;
            }

            const [ fileName, filePath ] = (() => {
                let fileName;
                let filePath;

                let i = 1;

                do {
                    fileName = title2fileName(metaData?.name!) + (i <= 1 ? '' : ' ' + i) + '.TS';
                    filePath = path.join(settings.downloadsDir, fileName);
                } while (existsSync(filePath) && ++i);

                return [ fileName, filePath ];
            })();

            if (!metaData) {
                resolve(null);
                return;
            }

            const videoMeta: VideoFile = {
                ...metaData,
                downloadStatus: 'init',
                path: './' + fileName
            } as VideoFile;

            const loadStream = async (url: string, id: number): Promise<Uint8Array|null> => {
                try {
                    await waitForInternet();

                    process.stdout.write(`Info: Downloading ${videoMeta.id}#"${videoMeta.name}" part: ` + id + '                                                                 \r');
                    const rsp = await axios.get(url, { responseType: 'arraybuffer', timeout: 4096 });
                    
                    
                    if (rsp.data) {
                        return new Uint8Array(rsp.data);
                    } else {
                        return null;
                    }
                } catch (err) {
                    if (!err) return await loadStream(url, id);

                    if (err.code && err.code.toUpperCase() !== 'ETIMEDOUT') {
                        if (!await waitForInternet()) {
                            return null;
                        } else {
                            return await loadStream(url, id);
                        }
                    } else if (err.code && err.code.toUpperCase() === 'ETIMEDOUT') {
                        process.stdout.write('Bad internet, waiting ...\r');
                        return await loadStream(url, id);
                    } else if (err.response.status === 404) {
                        return null;
                    } else {
                        console.error('Error: Unknown error, repeating...', err, filePath);
                        return await loadStream(url, id);
                    }
                }
            };
            
            let interval = setInterval(async () => {
                ipcMain.removeAllListeners(StartVideoDownload);

                if (!await waitForInternet()) {
                    clearInterval(interval);
                    videoMeta.downloadStatus = 'broken';
                    console.log(`Info: ${videoMeta.id}#"${videoMeta.name}" is broken.`);
                    resolve(videoMeta);
                } else {
                    useWindow().reload();
                    regEventOnce(StartVideoDownload, onStartVideoDownload);
                }
            }, toutTime);

            const onStartVideoDownload = async (url: string) => {
                clearInterval(interval);

                const mt = /^(https:\/\/.+?mp4:.+?\/media_.+?_)(\d+)(\.ts)$/ig.exec(url);

                if (!mt) {
                    reject('Error: Unexpected error, invalid stream url format.');
                    return;
                }

                const donePackages: { [id: number]: boolean } = {};
                const fh = openSync(filePath, 'ax');

                let panicCleanupDone = false;
                const panicCleanup = () => {
                    if (!panicCleanupDone) {
                        closeSync(fh);
                        unlinkSync(filePath);
                        panicCleanupDone = true;
                    }
                };

                window.on('close', panicCleanup);
                process.on('beforeExit', panicCleanup);
                process.on('exit', panicCleanup);

                videoMeta.downloadStarted = new Date();

                for (let id = 1; id > 0; id++) {
                    if (donePackages[id]) {
                        console.warn('WARNING: Double stream load call for id ' + id);
                        continue;
                    }

                    const response = await loadStream(`${mt[1]}${id}${mt[3]}`, id);

                    if (response === null) {
                        if (Object.keys(donePackages).length > 0) {
                            videoMeta.downloadStatus = 'done';
                            console.log(`Info: ${videoMeta.id}#"${videoMeta.name}" downloaded to "${videoMeta.path}"`);
                        } else {
                            console.log(`Info: ${videoMeta.id}#"${videoMeta.name}" is broken.`);
                            videoMeta.downloadStatus = 'broken';
                        }

                        videoMeta.downloadFinished = new Date();
                        
                        videoMeta.stream= {
                            initialStreamUrl: url,
                            maxPartId: id
                        };

                        id = -1;
                        resolve(videoMeta);
                        break;
                    } else {
                        videoMeta.downloadStatus = 'downloading';
                        writeSync(fh, new Uint8Array(response));
                        donePackages[id] = true;
                    }
                }

                closeSync(fh);

                if (videoMeta.downloadStatus !== 'done') {
                    unlinkSync(filePath);
                }
            };

            regEventOnce(StartVideoDownload, onStartVideoDownload);
        } catch (err) {
            reject(err);
        }
    })());
}

export async function waitForInternet(): Promise<boolean> {
    let hadInternetError: boolean = false;

    while (!await hasInternet()) {
        hadInternetError = true;
        process.stdout.write('No internet, waiting ...                                                                                                      \r');
        await new Promise((r, _) => setTimeout(r, 2048));
    }

    return hadInternetError;
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