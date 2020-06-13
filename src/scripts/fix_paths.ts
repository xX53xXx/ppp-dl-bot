import {
    useDatabase,
    getFileName
} from '../utils';

(async function() {
    const database = await useDatabase();

    database.forEach(async video => {
        video.path = video.path && ('./' + getFileName(video.path));
        await database.set(video);
    });

    database.save();
})()