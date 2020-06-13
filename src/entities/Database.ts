import { existsSync } from 'fs';
import { lockSync, unlockSync, checkSync } from 'proper-lockfile';
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
    convertingStarted?: Date|null;
    convertingFinished?: Date|null;
    path?: string;
    stream?: {
        initialStreamUrl: string;
        maxPartId: number;
    }
}

type DatabaseData = {[videoId: number]: Video};

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

    public async reload() {
        if (existsSync(this._dbFilePath)) {
            this._db = await readJsonFile<DatabaseData>(this._dbFilePath);
            this.fixDates();
        } else {
            await writeJsonFile(this._dbFilePath, {});
        }
    }

    public async set(video: Video, autoSave: boolean = true) {

        const cmd = async () => {
            await this.reload();

            this._db[video.id] = video;

            if (autoSave) {
                return this.save();
            }
        };

        if (this.isOwned()) {
            await cmd();
        } else {
            await this.waitLock();
            await cmd();
            this.unlock();
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
        const cmd = async () => {
            clearTimeout(this._saveTimeout!);
            return new Promise(async (resolve, _) => {
                try {
                    const rsp = await writeJsonFile(this._dbFilePath, this._db, true);
                    resolve(rsp);
                } catch {
                    this._saveTimeout = setTimeout(() => this.save(), 1024);
                }
            });
        };

        if (this.isOwned()) {
            await cmd();
        } else {
            await this.waitLock();
            await cmd();
            this.unlock();
        }
    }

    public async forEach(callback: (entry: Video, index: number) => Promise<void>) {
        let i = 0;
        let keys = Object.keys(this._db);

        while (keys.length > i) {
            keys = Object.keys(this._db);
            // @ts-ignore
            await callback(this._db[keys[i]], i++);
        };
    }


    private _locked: boolean = false;

    public isLocked(): boolean {
        return checkSync(this._dbFilePath);
    }

    public isOwned(): boolean {
        return this.isLocked() && this._locked;
    }

    public lock() {
        lockSync(this._dbFilePath);
        this._locked = true;
    }

    public unlock() {
        unlockSync(this._dbFilePath);
        this._locked = false;
    }

    public async waitLock() {
        if (this.isOwned()) return;

        while (this.isLocked()) {
            await new Promise((resolve, _) => setTimeout(resolve, 1024));
        }

        this.lock();
    }
}