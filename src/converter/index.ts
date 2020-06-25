import {
    useSettings,
    getFileName
} from '../utils';
import { Video } from '../entities/Database';
import dateFormat from 'date-fns/format';
import ffmpeg from 'fluent-ffmpeg';
import { renameSync, copyFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join as joinPath } from 'path';
import { getNextEntry2Convert, putEntryConvertingStatus, putEntry } from '../utils/client';
import isBefore from 'date-fns/isBefore';
import subSeconds from 'date-fns/subSeconds';

(async function() {
    const settings = await useSettings();

    async function convert(entry: Video, currentFilePath: string, newFilePath: string) {
        let lastSendTS = subSeconds(new Date(), 30);

        return new Promise((resolve, _) => {
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
                if (isBefore(lastSendTS, subSeconds(new Date(), 30))) { // Spam protection
                    lastSendTS = new Date();
                    putEntryConvertingStatus(entry.id);
                }
            })
            .on('error', (err) => {
                throw err;
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
            .addOption('-y')
            .saveToFile(newFilePath);
        });
    }


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

    const run = async () => {
        const response = await getNextEntry2Convert();

        if (response.data) {
            process.stdout.write('                                                                                                           \r');

            const entry = response.data;
            const now = new Date();

            const printSkippMessage = (status: string) => {
                console.log(`${entry.id}#"${entry.name}" skipped. -> ${status}`);
            };

            const currentFilePath = entry.path ? joinPath(settings.downloadsDir, entry.path!.replace(/^.\//g, '')) : undefined;
            if (!currentFilePath || !existsSync(currentFilePath)) {
                console.error('Error: Broken entry', entry);
                await putEntryConvertingStatus(entry.id, 'broken');
                return;
            }

            const newFilePath = currentFilePath.replace(/\.TS$/ig, '.mp4');
            if (existsSync(newFilePath)) {
                dropFile(newFilePath, now, true);
            }

            try {
                await convert(entry, currentFilePath, newFilePath);

                await putEntry(entry.id, { path: './' + getFileName(newFilePath) });
                await putEntryConvertingStatus(entry.id, 'done');

                if (currentFilePath !== newFilePath) {
                    dropFile(currentFilePath, now);
                }
            } catch (err) {
                console.error('Error: Something went wrong.', err, entry);
                await putEntryConvertingStatus(entry.id, 'broken');
            }
        }
    };

    do {
        try {
            await run();
        } catch (err) {
            console.error(`Unexpected error: `, err);
        }
    } while (await new Promise((resolve, _) => setTimeout(() => {
        process.stdout.write('Waiting for new entries to convert...                                                                 \r');
        resolve(true);
    }, 4096)));
})();

/**
 * database.reload();
        
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

            const currentFilePath = entry.path ? joinPath(settings.downloadsDir, entry.path!.replace(/^.\//g, '')) : undefined;
            if (!currentFilePath || !existsSync(currentFilePath)) {
                console.error('Error: Broken entry', entry);
                return;
            }

            if (entry.converterStatus) {
                if (entry.converterStatus === 'done') {
                    printSkippMessage('done');
                    return;
                }

                if (checkSync(currentFilePath) || (entry.converterStatus === 'converting' && entry.convertingStarted && !isAfter(subHours(now, 12), entry.convertingStarted))) {
                    printSkippMessage('other service converting');
                    return;
                }
            }

            lockSync(currentFilePath);

            entry.converterStatus = 'converting';
            entry.convertingStarted = now;

            database.set(entry);

            const newFilePath = currentFilePath.replace(/\.TS$/ig, '.mp4');

            if (existsSync(newFilePath)) {
                dropFile(newFilePath, now, true);
            }

            try {
                await convert(entry, currentFilePath, newFilePath);
                entry.converterStatus = 'done';
                entry.convertingFinished = new Date();
                entry.path = './' + getFileName(newFilePath);
                await database.set(entry);

                unlockSync(currentFilePath);

                if (currentFilePath !== newFilePath) {
                    dropFile(currentFilePath, now);
                }
            } catch (err) {
                console.error('Error: Something went wrong.', err, entry);
                entry.converterStatus = 'broken';
                entry.convertingFinished = new Date();
                await database.set(entry);
                unlockSync(currentFilePath);
                return;
            }
        });
 */