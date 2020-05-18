
export interface Account {
    username: string;
    password: string;
}

export interface Settings {
    account: Account;
    downloadsDir: string;
}