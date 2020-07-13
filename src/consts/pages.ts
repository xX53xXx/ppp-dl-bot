
export const Home = '/';
export const Login = '/login';
export const Logout = '/logout';
export const VideoGallery = '/videos/list/new/';
export const Video = '/video';

export type Params = {
    [Home]: undefined;
    [Login]: {
        form_benutzer: string;
        form_passwort: string;
    };
    [Logout]: undefined;
    [VideoGallery]: undefined;
    [Video]: {
        id: number;
    };
};