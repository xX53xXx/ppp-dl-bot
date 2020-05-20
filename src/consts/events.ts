import { Account } from '../entities';

export const CrossPagesEvent = 'cross-pages-event';
export const CrossPagesStorage = 'cross-pages-storage';

export const Navigate = 'navigate';
export const Authenticate = 'authenticate';

export type EventParams = {
    [Navigate]: string; // url
    [Authenticate]: Account; // credentials
    [CrossPagesEvent]: any; // TODO: Define type for processes object
};

export type EventResponseParams = {
    [Navigate]: Location;
    [Authenticate]: boolean;
    [CrossPagesEvent]: undefined;
    [CrossPagesStorage]: any; // TODO: Define type for processes object
};