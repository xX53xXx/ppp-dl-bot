import express from 'express';
import https from 'https';
import http from 'http';
import { BadRequest, NotFound, Forbidden } from 'ts-httpexceptions';
import asyncHandler from 'express-async-handler';
import swaggerUi from 'swagger-ui-express';
import bodyParser from 'body-parser';
import cors from 'cors';
import morgan from 'morgan';
import deepmerge from 'deepmerge';
import { useSettings, useDatabase, readJsonFile } from '../utils';
import fs from 'fs';
import os from 'os';

type Command = (() => Promise<void>);

(async () => {
    const settings = await useSettings();
    const database = await useDatabase();

    const swaggerDocument = await readJsonFile<any>('./swagger.json');

    const useHttps = (settings.service && settings.service.certificate && settings.service.privateKey);
    const port = settings.service?.port || 5335;

    const app = express();

    app.use(express.urlencoded({ extended: true }));
    app.use(bodyParser.json());
    app.use(cors({ exposedHeaders: ["Content-Range"] }));
    app.use(morgan('combined'));
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

    app.get('/entries', asyncHandler(async (req, res) => {
        res.json(database.getRawData());
    }));

    app.get('/entries/:id', asyncHandler(async (req, res) => {
        const id = parseInt(req.params.id, 10);

        if (id > 0) {
            const val = database.get(id);
            if (val) {
                res.json(val);
            } else {
                throw new NotFound(`Entry with id #${id} not found`);
            }
        } else {
            throw new BadRequest('Invalid id value');
        }
    }));

    app.put('/entries/:id', asyncHandler(async (req, res) => {
        const id = parseInt(req.params.id, 10);

        if (id > 0) {
            const val = database.get(id);
            if (val) {
                await database.set(deepmerge(val, req.body));
                
                if (req.body.id) {
                    delete req.body.id;
                }

                res.json(deepmerge(val, req.body));
            } else {
                throw new NotFound(`Entry with id #${id} not found`);
            }
        } else {
            throw new BadRequest('Invalid id value');
        }
    }));

    app.post('/entries', asyncHandler(async (req, res) => {
        const id = parseInt(req.params.id, 10);

        if (id > 0) {
            const val = req.body;
            if (val && val.id && val.id > 0) {
                await database.set(val);
                
                res.json(val);
            } else {
                throw new BadRequest('Invalid body format');
            }
        } else {
            throw new BadRequest('Invalid id value');
        }
    }));

    app.get('/next2convert', asyncHandler(async (req, res) => {
        await database.forEach(async (entry) => {
            if (entry.downloadStatus === "done" && [ 'done', 'converting', 'broken' ].indexOf(entry.converterStatus || '') < 0) {
                entry.converterStatus = "converting";
                entry.convertingStarted = new Date();
                entry.converterHost = req.query.host as string|undefined;

                res.json(entry);

                await database.set(entry);
                return false;
            }
        });
        
        res.end();
    }));

    app.put('/converting/:id', asyncHandler(async (req, res) => {
        const id = parseInt(req.params.id, 10);

        if (id > 0) {
            const entry = database.get(id);
            if (entry  && entry.converterStatus === "converting") {
                if (req.body && (req.body.status === "done" || req.body.status === "broken" || req.body.status === "aborted")) {
                    entry.converterStatus = req.body.status;

                    if (req.body.status === "done") {
                        entry.convertingFinished = new Date();
                        delete entry.lastConverterPing;
                    }
                } else {
                    entry.lastConverterPing = new Date();
                }

                await database.set(entry);
                res.json(entry);
            } else if(entry && entry.converterStatus !== "converting") {
                throw new Forbidden(`Entry #${id} do not has the converter status "converting".`);
            } else {
                throw new NotFound(`Entry with id #${id} not found`);
            }
        } else {
            throw new BadRequest('Invalid id value');
        }
    }));

    let svr;
    if (useHttps) {
        const certificate = fs.existsSync(settings.service!.certificate!) ? fs.readFileSync(settings.service!.certificate!) : settings.service!.certificate;
        const privateKey = fs.existsSync(settings.service!.privateKey!) ? fs.readFileSync(settings.service!.privateKey!) : settings.service!.privateKey;
        const credentials = {key: privateKey, cert: certificate};

        svr = https.createServer(credentials, app);
    } else {
        svr = http.createServer(app);
    }

    svr.listen(port, () => {
        try {
            const ifaces = os.networkInterfaces();
        
            for (let ifaceName of Object.keys(ifaces)) {
                const iface = ifaces[ifaceName];
    
                if (!iface) continue;
    
                for (let ipAddr of iface) {
                    if (ipAddr.family.toLowerCase() === 'ipv4') {
                        console.log(`Listening at ${ifaceName} => ${useHttps ? 'https' : 'http'}://${ipAddr.address}:${port}`);
                    }
                }
            }
        } catch {}
    })
})();