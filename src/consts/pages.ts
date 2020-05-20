
export const Home = '/index.php';
export const Login = '/login.php';
export const Logout = '/login.php?log=out';
export const VideoGallery = '/videogalerie.php';
export const Video = '/video.php';

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