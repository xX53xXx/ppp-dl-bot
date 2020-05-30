import * as path from 'path';
import { existsSync } from 'fs';
import { readJsonFile, useSettings, writeJsonFile } from '../utils';
import { VideoMeta } from './VideoMeta';
import parseISO from 'date-fns/parseISO';

export type DownloadStatus = 'init' | 'broken' | 'downloading' | 'done';
export type ConverterStatus = 'waiting' | 'converting' | 'done';

export interface Video extends VideoMeta {
    downloadStatus: DownloadStatus;
    converterStatus?: ConverterStatus;
    convertingStarted?: Date;
    path?: string;
}

type DatabaseData = {[videoId: number]: Video};

export class Database {
    private _db: DatabaseData = {};
    private _dbFilePath: string;

    private _saveTimeout: NodeJS.Timeout|null = null;

    constructor(databaseFileName: string = 'db.json') {
        this._dbFilePath = path.join(useSettings().downloadsDir, databaseFileName);
        this.reload();
    }

    private fixDates() {
        for (let key of Object.keys(this._db)) {
            if (typeof (this._db as any)[key].convertingStarted === 'string') {
                (this._db as any)[key].convertingStarted = parseISO((this._db as any)[key].convertingStarted);
            }
        }
    }

    public reload() {
        if (existsSync(this._dbFilePath)) {
            this._db = readJsonFile<DatabaseData>(this._dbFilePath);
            this.fixDates();
        }
    }

    public async set(video: Video, autoSave: boolean = true) {
        this.reload();

        this._db[video.id] = video;

        if (autoSave) {
            return this.save();
        }
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

    public async forEach(callback: (entry: Video, index: number) => Promise<void>) {
        let i = 0;
        let keys = [];

        while(keys.length > i) {
            keys = Object.keys(this._db);
            // @ts-ignore
            await callback(this._db[keys[i]], i++);
        };
    }
}