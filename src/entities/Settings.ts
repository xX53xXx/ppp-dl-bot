
export interface Account { //Used for login and auto relogin
    username: string;
    password: string;
}

export interface ConverterSettings {
    ffmpegPath?: string; // default: System installed ffmpeg
    ffprobePath?: string; // default: System installed ffprobe
    svtAv1Path?: string; // default: System installed svt-av1

    // The drop dir, is where to put old video files after convertion.
    // If null, old file will be deleted
    dropDir?: string|null; // default: no drop
}

export interface ServiceSettings {
    // Switches on auto https if keys are given. (Reccomendet!)
    certificate?: string;
    privateKey?: string;

    port?: number; // Default: 5335
}

export interface Settings {
    account: Account;

    serviceUrl: string; // Example: https://192.168.0.22:5335

    service?: ServiceSettings;

    downloadsDir: string;
    videoPartTimeout?: number; // in seconds, default: 30
    converter?: ConverterSettings;

    tempDir?: string; // default: system temp dir, used for svt-av1 converting
}