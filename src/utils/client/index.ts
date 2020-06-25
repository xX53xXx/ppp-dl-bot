import axios from 'axios';
import { useSettings } from '../';
import { DatabaseData, Video, DownloadStatus, ConverterStatus } from '../../entities/Database';
import os from 'os';

export interface VideoUpdate {
    url?: string;
    name?: string;
    downloadUrl?: string;
    downloadStatus?: DownloadStatus;
    downloadStarted?: Date|null;
    downloadFinished?: Date|null;
    converterStatus?: ConverterStatus;
    lastConverterPing?: Date|null;
    converterHost?: string;
    convertingStarted?: Date|null;
    convertingFinished?: Date|null;
    path?: string;
    stream?: {
        initialStreamUrl?: string;
        maxPartId?: number;
    }
}

// Database

export async function getAllEntries() {
    const url = await (await useSettings()).serviceUrl;
    return axios.get<DatabaseData>(url + '/entries');
}

export async function getEntry(id: number) {
    if (id <= 0) {
        throw new Error('Id must be numeric and greater 0');
    }

    const url = await (await useSettings()).serviceUrl;
    return axios.get<Video>(url + '/entries/' + id);
}

export async function postEntry(entry: Video) {
    if (!entry.id || entry.id <= 0) {
        throw new Error('Id must be numeric and greater 0');
    }

    const url = await (await useSettings()).serviceUrl;
    return axios.post<Video>(url + '/entries', entry);
}

export async function putEntry(id: number, entryUpdates: VideoUpdate) {
    if (id <= 0) {
        throw new Error('Id must be numeric and greater 0');
    }

    const url = await (await useSettings()).serviceUrl;
    return axios.put<Video>(url + '/entries/' + id, entryUpdates);
}

// Downloader
// TODO

// Converter

export async function getNextEntry2Convert() {
    const url = await (await useSettings()).serviceUrl;
    return axios.get<Video|null>(url + '/next2convert', {
        params: {
            host: os.hostname()
        }
    });
}

export async function putEntryConvertingStatus(id: number, status?: "done" | "broken" | "aborted") {
    if (id <= 0) {
        throw new Error('Id must be numeric and greater 0');
    }

    const url = await (await useSettings()).serviceUrl;
    return axios.put<Video>(url + '/converting/' + id, status && { status });
}