import { ipcRenderer } from 'electron';
import axios from 'axios';
import { stringify as toQueryArgs } from 'querystring';
import { URL } from '../../consts';
import {
    Authenticate,
    EventParams,
    EventResponseParams,
    PageStructureError
} from '../../consts/events';
import {
    Params
} from '../../consts/pages';

export function clone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
}

// ---

export function navigate<PageName extends keyof Params>(page: PageName, args?: Params[PageName]) {
    location.href = (URL + '/' + page).replace(/\/+/g, '/') + (args ? '?' + toQueryArgs(args) : '');
}

// ---

export function regEvent<EventName extends keyof EventParams>(eventName: EventName, callback: (params: EventParams[EventName], event: Event) => void) {
    ipcRenderer.on(eventName, (e, p) => callback(p, e));
}

export function sendEvent<EventName extends keyof EventResponseParams>(eventName: EventName, params: EventResponseParams[EventName]) {
    ipcRenderer.send(eventName, params);
}

// ---

export async function postRequest<PageName extends keyof Params>(pageName: PageName, params?: Params[PageName]) {
    return axios.post(pageName, params);
}

// ---

export function isAuthenticated(): boolean {
    return !!document.querySelector('a[href="login.php?log=out"]');
}

export function getUsername(): string | null {
    const em = document.querySelector('#about-us');
    em?.querySelector('i')?.remove();

    if (!!em) {
        return em.innerHTML.trim();
    }
    
    return null;
}

export function sendIsAuthenticated(username: string) {
    sendEvent(Authenticate, username);
}

export function throwPageStructureError(message: string) {
    sendEvent(PageStructureError, message);
}

export function fixFailedChars(value: string): string {
    value = value.replace('Ã¶', 'ö');
    value = value.replace('Ã¤', 'ä');
    value = value.replace('Ã¼', 'ü');

    value = value.replace('ÃŸ', 'ß');
    value = value.replace('Â´', '\'');

    // ---

    value = value.replace('├Â', 'ö');

    value = value.replace('&amp;', '&');

    return value;
}