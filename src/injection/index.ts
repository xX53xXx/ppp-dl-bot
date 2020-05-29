import { 
    Navigate,
    Authenticate,
    GetLastVideoId,
    GetVideoMetaData,
    StoreVideoData,
} from '../consts/events';

import {
    clone,
    regEvent,
    sendEvent,
    getUsername,
    throwPageStructureError,
    fixFailedChars
} from './utils';

import {
    VideoMeta
} from '../entities';

// Hack the stream
const $XMLHttpRequest = window.XMLHttpRequest;
// @ts-ignore
window.XMLHttpRequest = function() {
    const ths: any = this;
    const xhr: any = new $XMLHttpRequest();

    const debug = false;

    for (let prop in xhr) {
        if (typeof xhr[prop] === 'function') {
            ths[prop] = (...args: any[]) => {
                debug && console.log(`XHR function "${prop}" is called with args: `, args);
                return xhr[prop](...args);
            }
        } else {
            Object.defineProperty(ths, prop, {
                get: () => {
                    debug && console.log(`XHR property "${prop}" is read and contains value: `, xhr[prop]);
                    return xhr[prop];
                },
                set: (v: any) => {
                    if (typeof v === 'function') {
                        debug && console.log(`XHR property "${prop}" is set and gets function: `, v.toString());
                        xhr[prop] = (e: any) => {
                            if (e.type === 'readystatechange' && ths.getResponseHeader('Content-Type') === 'video/MP2T') {
                                const buffer: ArrayBuffer = e?.target?.response;
                                if (buffer) {
                                    sendEvent(StoreVideoData, {
                                        dataURL: e?.target?.responseURL,
                                        data: buffer
                                    });
                                }
                                v(e);
                            } else {
                                v(e);
                            }
                        };
                    } else {
                        debug && console.log(`XHR property "${prop}" is set and gets value: `, v);
                        xhr[prop] = v;
                    }
                },
                enumerable: true,
                configurable: true
            });
        }
    }
};
// /// Hack the stream


// --- On Load
window.onload = async (e: Event) => sendEvent(Navigate, { location: clone<Location>(location), username: getUsername() });

// ---

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

regEvent(GetVideoMetaData, id => {
    let metaData: VideoMeta|null = null;
    
    const content = document.querySelector<HTMLDivElement>('#content_big');

    if (content) {
        const titleElement = content.querySelector<HTMLHRElement>('h2');
        const downloadLink = content.querySelector<HTMLAnchorElement>('a[href^="download.php?id"]');

        if (titleElement && downloadLink) {
            metaData = {
                id,
                url: location.href,
                name: titleElement.innerHTML.trim(),
                downloadUrl: location.origin + '/' + downloadLink.getAttribute('href')?.trim()
            };
        }
    }

    if (metaData && metaData.name && metaData.name.trim().length > 0) {
        metaData.name = fixFailedChars(metaData.name.trim());
    } else {
        metaData = null;
    }

    sendEvent(GetVideoMetaData, metaData);
});