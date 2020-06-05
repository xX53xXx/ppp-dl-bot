
export interface Account {
    username: string;
    password: string;
}

export interface ConverterSettings {
    ffmpegPath?: string; // default: System installed ffmpeg

    // The drop dir, is where to put old video files after convertion.
    // If null, old file will be deleted
    dropDir?: string|null; // default: no drop
}

export interface Settings {
    account: Account;
    downloadsDir: string;
    videoPartTimeout?: number; // in seconds, default: 30
    converter?: ConverterSettings;

    // Deprecated: Maybe will be removed soon
    tempDir?: string; // default: system temp dir
}