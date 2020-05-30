import {
    useDatabase,
    getFileName
} from '../utils';

const database = useDatabase();

database.forEach(async video => {
    video.path = video.path && ('./' + getFileName(video.path));
    await database.set(video);
});

database.save();