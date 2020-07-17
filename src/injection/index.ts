import { 
    Navigate,
    Authenticate,
    GetLastVideoId,
    GetVideoMetaData,
    StartVideoDownload
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
let _flag: string | null = null;
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
                            if (e.type === 'readystatechange' && ths.getResponseHeader('Content-Type') === 'video/MP2T' && e?.target?.responseURL) {
                                const mt = /^(https:\/\/.+?mp4:.+?\/media_.+?_)(\d+)(\.ts)$/ig.exec(e?.target?.responseURL);
                                // const id = mt ? parseInt(mt[2], 10) : -1;

                                if (mt && _flag !== mt[1]) {
                                    _flag = mt[1];
                                    sendEvent(StartVideoDownload, e.target.responseURL);
                                }
                            }

                            v(e);
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
    const form = document.querySelector<HTMLFormElement>('form');

    if (form) {
        const userField = form.querySelector<HTMLInputElement>('input[name="username"]');
        const passwordField = form.querySelector<HTMLInputElement>('input[name="password"]');

        const rememberMeBtn = form.querySelector<HTMLInputElement>('input[name="_remember_me"]');
        if (rememberMeBtn) {
            rememberMeBtn.setAttribute('checked', '');
        }

        const submitBtn = form.querySelector<HTMLButtonElement>('[type="submit"]');

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
    const href = document.querySelector<HTMLAnchorElement>('a[href^="/video/"]:first-child');

    if (href) {
        const videoUrl = href.getAttribute('href');
        if (videoUrl) {
            const mt = /\/video\/(\d+)\/view/is.exec(videoUrl);

            if (mt) {
                const id = parseInt(mt[1], 10);

                if (id && id > 0) {
                    sendEvent(GetLastVideoId, id);
                    return;
                }
            }
        }
    }

    // throwPageStructureError('Invalid video gallery structure');
});

regEvent(GetVideoMetaData, id => {
    let metaData: VideoMeta|null = null;
    
    const titleElement = document.querySelector<HTMLHeadElement>('h5.w-100');
    const downloadLink = document.querySelector<HTMLAnchorElement>('a[href^="/video/"]:first-child');

    if (titleElement && downloadLink) {
        metaData = {
            id,
            url: location.href,
            name: titleElement.innerHTML.trim(),
            downloadUrl: location.origin + '/' + downloadLink.getAttribute('href')?.trim()
        };
    }

    if (metaData && metaData.name && metaData.name.length > 0) {
        metaData.name = fixFailedChars(metaData.name);
    } else {
        metaData = null;
    }

    sendEvent(GetVideoMetaData, metaData);
});