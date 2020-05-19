import { Account } from '../entities';

export const Navigate = 'navigate';
export const Authenticate = 'authenticate';

export type EventParams = {
    [Navigate]: string; // url
    [Authenticate]: Account; // credentials
};

export type EventResponseParams = {
    [Navigate]: Location;
    [Authenticate]: boolean;
};