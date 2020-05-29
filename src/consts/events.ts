import { Account, VideoMeta } from '../entities';

export const PageStructureError = 'error-page-structure';

export const Navigate = 'navigate';
export const Authenticate = 'authenticate';

export const GetLastVideoId = 'get-last-video-id';
export const GetVideoMetaData = 'get-video-meta-data';

// export const DownloadVideo = 'download-video';
export const StoreVideoData = 'store-video-data';

export type NavigationResponse = {
    location: Location;
    username: string|null;
};


// From main to browser
export type EventParams = {
    [Navigate]: string; // url
    [Authenticate]: Account; // credentials
    [GetLastVideoId]: undefined;
    [GetVideoMetaData]: number;
    // [DownloadVideo]: VideoMeta;
};

// From browser to main
export type EventResponseParams = {
    [Navigate]: NavigationResponse;
    [Authenticate]: string; // Authenticated username
    [PageStructureError]: string;
    [GetLastVideoId]: number;
    [GetVideoMetaData]: VideoMeta|null;
    [StoreVideoData]: {
        dataURL: string;
        data: ArrayBuffer;
    };
};