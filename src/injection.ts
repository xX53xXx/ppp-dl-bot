import { ipcRenderer } from 'electron';
import axios from 'axios';
import { stringify as toQueryArgs } from 'querystring';
import { URL } from './consts';
import { 
    CrossPagesEvent,
    CrossPagesStorage,
    Navigate,
    Authenticate,

    EventParams,
    EventResponseParams
} from './consts/events';
import {
import { navigate } from './injection';
    Login,
    Params,
    Logout
} from './consts/pages';

// ---

export function navigate<PageName extends keyof Params>(page: PageName, args?: Params[PageName]) {
    location.href = (URL + '/' + page).replace(/\/+/g, '/') + (args ? '?' + toQueryArgs(args) : '');
}

// ---

function regEvent<EventName extends keyof EventParams>(eventName: EventName, callback: (params: EventParams[EventName], event: Event) => void) {
    ipcRenderer.on(eventName, (e, p) => callback(p, e));
}

function sendEvent<EventName extends keyof EventResponseParams>(eventName: EventName, params: EventResponseParams[EventName]) {
    ipcRenderer.send(eventName, params);
}

// ---

async function postRequest<PageName extends keyof Params>(pageName: PageName, params?: Params[PageName]) {
    return axios.post(pageName, params);
}

// ---

regEvent(Navigate, async url => {
    location.href = url;
});

regEvent(Authenticate, async credentials => {

    console.log('Here i am: ', JSON.stringify(_processes, null, 2));

    processCrossPages('test', {
        $init: ({ next, set }) => {
            console.log('Init step');
            set('cred', credentials);
            next('step3');

            location.reload();
        },
        step2: ({ get }) => {
            console.log('Step 2, credentials: ', get('cred'));

            // location.reload();
        },
        step3: ({ get, set, next }) => {
            console.log('Step 3, credentials: ', get('cred'));
            if (get('cred') !== null) {
                set('cred', null);
                next('step2');
            }

            // location.reload();
        },
        step4: () => {
            console.log('Step 4, final step.');
        }
    });

    /*if (isAuthenticated()) {
        if (getUsername().toLowerCase() === credentials.username.toLowerCase()) {
            sendIsAuthenticated();
        } else {
            processCrossPages(Authenticate, {
                init: ({ set, next }) => {
                    set('credentials', credentials);
                    next('login');
                    location.href = Logout;
                },
                login: ({ done }) => {
                    done();
                }
            })
        }
    } else {
        try {
            const response = await postRequest(Login, {
                form_benutzer: credentials.username,
                form_passwort: credentials.password
            });

            console.log(response);

            sendIsAuthenticated();
        } catch (error) {
            console.error(error);
            // TODO: Do more

            sendIsAuthenticated(false);
        }
    }*/
});

// ---

function sendIsAuthenticated(value: boolean = true) {
    sendEvent(Authenticate, true);
}

// --- On Load

window.onload = async (e: Event) => sendEvent(CrossPagesEvent, undefined);
async function onAfterCrossPagesProcesses() {
    sendEvent(Navigate, location);
    console.log('Done');
}

// ---

function isAuthenticated() {
    return !!document.querySelector('a[href="login.php?log=out"]');
}

function getUsername() {
    const em = document.querySelector('div#search td:nth-child(2) b');

    if (!!em) {
        return em.innerHTML;
    }
    
    throw new Error('Not authenticated.');
}

// ---

type StepName = string;
type SetFunction = (key: string, value: any) => void;
type GetFunction = (key: string) => any;
type NextFunction = (stepName: StepName) => void;
type DoneFunction = () => void;

type StepType = (deps: { 
    set: SetFunction; 
    get: GetFunction; 
    next: NextFunction; 
    done: DoneFunction;
    navigate: typeof navigate;
}) => void;

type Steps = {
    $init: StepType;
    [stepName: string]: StepType;
};

let _processes: any = null;
regEvent(CrossPagesEvent, async _procs => {
    _processes = _procs;

    const processes = Object.keys(_processes).reverse();

    if (processes.length > 0) {
        for (let processKey of processes) {
            await _runNextStep(processKey);
        }
    }

    onAfterCrossPagesProcesses();
});

function _saveProcesses() {
    // localStorage.setItem('cross-page-processes', JSON.stringify(_processes));
    sendEvent(CrossPagesStorage, _processes);
}

function _set(processKey: string, key: string, value: any) {
    _processes[processKey].data[key] = value;
    _saveProcesses();
}

function _get(processKey: string, key: string): any {
    return _processes[processKey].data[key];
}

function _next(processKey: string, step: StepName) {

    if (step === '$init') {
        throw new Error('Forbidden step name $init.');
    }

    _processes[processKey].nextStep = step;
    _saveProcesses();
}

function _done(processKey: string) {
    _processes[processKey].nextStep = undefined;
    _saveProcesses();
}

async function _runNextStep(processKey: string): Promise<boolean> {
    _processes[processKey].step = _processes[processKey].nextStep;

    if (!_processes[processKey].step) {
        delete _processes[processKey];
    }

    _saveProcesses();

    if (!!_processes[processKey]) {
        return _runStep(processKey);
    }

    return true;
}

async function _runStep(processKey: string, initStep?: StepType): Promise<boolean> {
    const step = _processes[processKey].step;
    const steps = Object.keys(_processes[processKey].steps);
    const stepIndex = steps.indexOf(step);

    if (stepIndex < (steps.length - 1)) {
        _next(processKey, steps[stepIndex + 1]);
    } else {
        _done(processKey);
    }

    const deps = {
        set: (key: string, value: any) => _set(processKey, key, value),
        get: (key: string): any => _get(processKey, key),
        next: (stepName: StepName) => _next(processKey, stepName),
        done: () => _done(processKey),
        navigate: () => {
            
        }
    };

    if (step === '$init' && initStep) {
        await initStep(deps);
    } else {
        const stepFnc = eval(_processes[processKey].steps[step]);

        if (typeof stepFnc === 'function') {
            await stepFnc(deps);
        } else {
            throw new Error(`Something went wrong on step '${step}'`);
        }
    }

    return _runNextStep(processKey);
}

function processCrossPages(processKey: string, steps: Steps) {
    const _steps: any = {};

    for (let stepName of Object.keys(steps)) {
        if (stepName === '$init') continue;
        _steps[stepName] = steps[stepName].toString();
    }

    _processes[processKey] = {
        step: '$init',
        nextStep: undefined,
        steps: _steps,
        data: {}
    };

    _saveProcesses();

    _runStep(processKey, steps['$init']);
}