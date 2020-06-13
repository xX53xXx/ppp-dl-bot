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

(async function() {
    const database = await useDatabase();
    const settings = await useSettings();

    let currentProcessingVideo: Video|null = null;
    async function convert(entry: Video, currentFilePath: string, newFilePath: string) {
        return new Promise((resolve, _) => {
            currentProcessingVideo = entry;

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
                entry.converterStatus = 'broken';
                currentProcessingVideo = null;
            })
            .on('end', (stdout, stderr) => {
                console.log(`Converting of ${entry.id}#"${entry.name}": "${entry.path}" => "${newFilePath}" is done.`);
                entry.converterStatus = 'done';
                currentProcessingVideo = null;
                resolve();
            })
            .input(currentFilePath)
            .addOption('-c:v h264')
            .addOption('-c:a aac')
            .addOption('-preset veryslow')
            .addOption('-level 6.2')
            .addOption('-y')
            .saveToFile(newFilePath);
        });
    }

    // TODO: Why this do not work?
    process.on('exit', async code => {
        if (currentProcessingVideo) {
            currentProcessingVideo.converterStatus = 'aborted';
            database.set(currentProcessingVideo);
            await database.save();
        }

        console.log('Process exit with code: ', code);
    });

    /**
     * Drop file.
     * @param dropAnyway If true and no drop is activated, the files will be renamed with a timestamp append.
     */
    function dropFile(targetFilePath: string, now: Date = new Date(), dropAnyway: boolean = false) {
        const forceDrop = () => {
            const dropFilePath = targetFilePath.replace(/(.+?)(\.mp4|\.ts)$/ig, `$1.${dateFormat(now, 'T')}$2`);
            console.log(`Force-dropping old file: "${targetFilePath}" => "${dropFilePath}"`);
            renameSync(targetFilePath, dropFilePath);
        };

        const dropDir = settings.converter?.dropDir;
        
        if (dropDir === null) {
            console.log(`Deleting old file: "${targetFilePath}"`);
            unlinkSync(targetFilePath);
        } else if (dropDir) {
            mkdirSync(dropDir, { recursive: true });

            if (existsSync(dropDir)) {
                const dropFilePath = joinPath(dropDir, getFileName(targetFilePath));

                console.log(`Dropping old file: "${targetFilePath}" => "${dropFilePath}"`);

                try {
                    renameSync(targetFilePath, dropFilePath);
                } catch {
                    copyFileSync(targetFilePath, dropFilePath);
                    unlinkSync(targetFilePath);
                }
            } else {
                console.warn(`WARNING: Drop dir "${dropDir}" do not exists!`);
                forceDrop();
            }
        } else if (dropAnyway) {
            forceDrop();
        }
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
                dropFile(newFilePath, now, true);
            }

            try {
                await convert(entry, currentFilePath, newFilePath);
                entry.converterStatus = 'done';
                entry.path = './' + getFileName(newFilePath);

                if (currentFilePath !== newFilePath) {
                    dropFile(currentFilePath, now);
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
})();