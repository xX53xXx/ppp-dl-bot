import { existsSync } from 'fs';
import { readJsonFile, writeJsonFile } from '../utils';
import { VideoMeta } from './VideoMeta';
import parseISO from 'date-fns/parseISO';

export type DownloadStatus = 'init' | 'broken' | 'downloading' | 'repeat' | 'done';
export type ConverterStatus = 'waiting' | 'converting' | 'broken' | 'aborted' | 'done';

export interface Video extends VideoMeta {
    downloadStatus: DownloadStatus;
    downloadStarted?: Date|null;
    downloadFinished?: Date|null;
    converterStatus?: ConverterStatus;
    lastConverterPing?: Date|null;
    converterHost?: string;
    convertingStarted?: Date|null;
    convertingFinished?: Date|null;
    path?: string;
    stream?: {
        initialStreamUrl: string;
        maxPartId: number;
    }
}

export type DatabaseData = {[videoId: number]: Video};

export class Database {
    private _db: DatabaseData = {};
    private _dbFilePath: string;

    private _saveTimeout: NodeJS.Timeout|null = null;

    constructor(databaseFilePath: string) {
        this._dbFilePath = databaseFilePath;
        this.reload();
    }

    private fixDates() {
        for (let key of Object.keys(this._db)) {
            if (typeof (this._db as any)[key].convertingStarted === 'string') {
                (this._db as any)[key].downloadStarted = parseISO((this._db as any)[key].downloadStarted);
                (this._db as any)[key].downloadFinished = parseISO((this._db as any)[key].downloadFinished);

                (this._db as any)[key].convertingStarted = parseISO((this._db as any)[key].convertingStarted);
                (this._db as any)[key].convertingFinished = parseISO((this._db as any)[key].convertingFinished);
            }
        }
    }

    public getRawData(): DatabaseData {
        return this._db;
    }

    public async reload() {
        if (existsSync(this._dbFilePath)) {
            this._db = await readJsonFile<DatabaseData>(this._dbFilePath);
            this.fixDates();
        } else {
            await writeJsonFile(this._dbFilePath, {});
        }
    }

    public async set(video: Video, autoSave: boolean = true) {
        await this.reload();

            this._db[video.id] = video;

            if (autoSave) {
                return this.save();
            }
    }

    public async setBroken(videoId: number, autoSave: boolean = true) {
        this.set({
            id: videoId,
            downloadStatus: 'broken'
        }, autoSave);
    }

    public get(id: number): Video|undefined {
        return this._db[id];
    }

    public async save() {
        clearTimeout(this._saveTimeout!);
        return new Promise(async (resolve, _) => {
            try {
                const rsp = await writeJsonFile(this._dbFilePath, this._db, true);
                resolve(rsp);
            } catch {
                this._saveTimeout = setTimeout(() => this.save(), 1024);
            }
        });
    }

    public async forEach(callback: (entry: Video, index: number) => Promise<void|boolean>) {
        let i = 0;
        let keys = Object.keys(this._db);

        while (keys.length > i) {
            keys = Object.keys(this._db);
            // @ts-ignore
            if (await callback(this._db[keys[i]], i++) === false) {
                break;
            }
        };
    }
}