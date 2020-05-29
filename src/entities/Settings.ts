
export interface Account {
    username: string;
    password: string;
}

export interface Settings {
    account: Account;
    downloadsDir: string;
    tempDir?: string; // default: system temp dir
    videoPartTimeout?: number; // in seconds, default: 30
}