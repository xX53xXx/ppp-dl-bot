import {
    useDatabase,
    useSettings,
    getFileName
} from '../utils';
import { Video } from '../entities/Database';
import isAfter from 'date-fns/isAfter';
import isEqual from 'date-fns/isEqual';
import subHours from 'date-fns/subHours';
import dateFormat from 'date-fns/format';
import ffmpeg from 'fluent-ffmpeg';
import { renameSync, copyFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join as joinPath } from 'path';

const database = useDatabase();
const settings = useSettings();

async function convert(entry: Video, currentFilePath: string, newFilePath: string) {
    return new Promise((resolve, reject) => {
        ffmpeg({
            source: settings.converter?.ffmpegPath
        })
        .on('start', (cmd) => {
            console.log('');
            console.log(`Start converting ${entry.id}#"${entry.name}": "${entry.path}" => "${newFilePath}"`);
            console.log(cmd);
        })
        .on('codecData', (data) => {
            // console.log(data);
        })
        .on('progress', (progress) => {
            process.stdout.write('Processing: ' + Math.round(progress.percent) + '%                                                                 \r');
        })
        .on('error', (err) => {
            console.error(err);
        })
        .on('end', (stdout, stderr) => {
            console.log(`Converting of ${entry.id}#"${entry.name}": "${entry.path}" => "${newFilePath}" is done.`);
            resolve();
        })
        .input(currentFilePath)
        .addOption('-c:v h264')
        .addOption('-c:a aac')
        .addOption('-preset veryslow')
        .addOption('-level 6.2')
        .saveToFile(newFilePath);
    });
}

let runTimeout: any = null;
const run = async () => {
    database.reload();
    
    await database.forEach(async entry => {
        database.reload();

        const printSkippMessage = (status: string) => {
            console.log(`${entry.id}#"${entry.name}" skipped. -> ${status}`);
        };

        if (entry.downloadStatus !== 'done') {
            printSkippMessage('not ready');
            return;
        }

        const now = new Date();

        if (entry.converterStatus) {
            if (entry.converterStatus === 'done') {
                printSkippMessage('done');
                return;
            }
            if (entry.converterStatus === 'converting' && entry.convertingStarted && !isAfter(subHours(now, 12), entry.convertingStarted)) {
                printSkippMessage('other service converting');
                return;
            }
        }

        const currentFilePath = entry.path ? joinPath(settings.downloadsDir, entry.path!.replace(/^.\//g, '')) : undefined;

        if (!currentFilePath || !existsSync(currentFilePath)) {
            console.error('Error: Broken entry', entry);
            return;
        }

        entry.converterStatus = 'converting';
        entry.convertingStarted = now;

        database.set(entry);

        await database.save();

        database.reload();

        {
            const tmp = database.get(entry.id);
            if (!(tmp && tmp.convertingStarted && isEqual(tmp.convertingStarted, now))) {
                printSkippMessage('other service converting OR broken');
                return;
            } else {
                entry = tmp;
            }
        }

        const newFilePath = currentFilePath.replace(/\.TS$/ig, '.mp4');

        if (existsSync(newFilePath)) {
            renameSync(newFilePath, newFilePath.replace(/(.+?)(\.mp4)$/ig, `$1.${dateFormat(now, 'T')}$2`));
        }

        try {
            await convert(entry, currentFilePath, newFilePath);
            entry.converterStatus = 'done';
            entry.path = './' + getFileName(newFilePath);

            if (currentFilePath !== newFilePath) {
                const dropDir = settings.converter?.dropDir;
    
                if (dropDir === null) {
                    console.log(`Deleting old file: "${currentFilePath}"`);
                    unlinkSync(currentFilePath!);
                } else if (dropDir) {
                    mkdirSync(dropDir, { recursive: true });

                    if (existsSync(dropDir)) {
                        const dropFilePath = joinPath(dropDir, getFileName(currentFilePath!));

                        console.log(`Dropping old file: "${currentFilePath}" => "${dropFilePath}"`);

                        try {
                            renameSync(currentFilePath!, dropFilePath);
                        } catch {
                            copyFileSync(currentFilePath!, dropFilePath);
                            unlinkSync(currentFilePath!);
                        }
                    }
                }
            }
        } catch (err) {
            console.error('Error: Something went wrong.', err, entry);
            return;
        }

        await database.save();
    });

    clearTimeout(runTimeout);
    console.log('Done. Recheck in 1 minute.');
    runTimeout = setTimeout(run, 60000);
};

run();