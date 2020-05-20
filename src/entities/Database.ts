export type DownloadStatus = 'done' | 'todo' | 'in_progress' | 'broken';

export interface Video {
    id: number;
    url: string;
    status: DownloadStatus;
    name?: string;
    path?: string;
    downloadUrl?: string;
}

export type Database = {  }