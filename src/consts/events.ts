import { Account } from '../entities';

export const PageStructureError = 'error-page-structure';

export const Navigate = 'navigate';
export const Authenticate = 'authenticate';

export const GetLastVideoId = 'get-last-video-id';
export const GetVideoMetaData = 'get-video-meta-data';

export type NavigationResponse = {
    location: Location;
    username: string|null;
};

export type EventParams = {
    [Navigate]: string; // url
    [Authenticate]: Account; // credentials
    [GetLastVideoId]: undefined;
};

export type EventResponseParams = {
    [Navigate]: NavigationResponse;
    [Authenticate]: string; // Authenticated username
    [PageStructureError]: string;
    [GetLastVideoId]: number;
};