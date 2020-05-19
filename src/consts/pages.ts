
export const Home = '/index.php';
export const Login = '/login.php';
export const Logout = '/login.php?log=out';

export type Params = {
    [Home]: undefined;
    [Login]: {
        form_benutzer: string;
        form_passwort: string;
    };
    [Logout]: undefined;
};