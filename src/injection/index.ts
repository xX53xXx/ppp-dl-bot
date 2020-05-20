import { 
    Navigate,
    Authenticate,
    GetLastVideoId,
} from '../consts/events';

import {
    clone,
    regEvent,
    sendEvent,
    getUsername,
    throwPageStructureError
} from './utils';
import { ipcRenderer, ipcMain } from 'electron';

// --- On Load
window.onload = async (e: Event) => sendEvent(Navigate, { location: clone<Location>(location), username: getUsername() });

regEvent(Authenticate, async credentials => {
    const form = document.querySelector<HTMLFormElement>('form#form1');

    if (form) {
        const userField = form.querySelector<HTMLInputElement>('input[name="form_benutzer"]');
        const passwordField = form.querySelector<HTMLInputElement>('input[name="form_passwort"]');
        const submitBtn = form.querySelector<HTMLButtonElement>('input[name="submit"]');

        if (userField && passwordField && submitBtn) {
            userField.setAttribute('value', credentials.username);
            passwordField.setAttribute('value', credentials.password);

            submitBtn.click();
            return;
        }
    }

    throwPageStructureError('Invalid form structure');
});

regEvent(GetLastVideoId, () => {
    const href = document.querySelector<HTMLAnchorElement>('#content .cont_box a[href^="video.php?id"]:first-child');

    if (href) {
        const videoUrl = href.getAttribute('href');
        if (videoUrl) {
            const mt = /id=(\d+)/is.exec(videoUrl);

            if (mt) {
                const id = parseInt(mt[1], 10);

                if (id && id > 0) {
                    sendEvent(GetLastVideoId, id);
                    return;
                }
            }
        }
    }

    throwPageStructureError('Invalid video gallery structure');
});