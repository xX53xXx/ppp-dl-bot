import { ipcRenderer } from 'electron';
import { 
    Navigate,

    EventParams
} from './consts/events';

function regEvent<EventName extends keyof EventParams>(eventName: EventName, callback: (params: EventParams[EventName], event: any) => Promise<void>) {
    ipcRenderer.on(eventName, (e, p) => callback(p, e));
}

regEvent(Navigate, async params => {
    location.href = params.url;
});


window.onload = (e: any) => {
    ipcRenderer.send(Navigate, location);
};