import SurrealDB from 'surrealdb.js';
import { log, info, warn, error } from './Logger.js';

const sdb = new SurrealDB();

async function initDB() {
    const connected = await connect(sdb);

    setInterval(async () => {
        if (sdb.status === 1) {
            await connect(sdb, false);
        }
    }, 1000);

    if (connected) {
        return new db(sdb);
    }
    return null;
}

async function connect(sdb: SurrealDB, _log = true) {
    try {
        if (_log) log(`[Database] Connecting...`);
    
        try {
            await sdb.connect('http://127.0.0.1:8000/rpc', {
                auth: {
                    namespace: 'golink',
                    database: 'main',
                    username: process.env['SURREAL_USER'],
                    password: process.env['SURREAL_PASSWORD']
                },
                prepare: async (db) => {
                    await db.use({ namespace: 'golink', database: 'main' });
                }
            });
    
            if (_log) log(`[Database] Connected.`);

            return true;
        } catch (err) {
            if (_log) log(`[Database] Failed to connect.`, err);

            return false;
        }
    } catch (err) {
        if (_log) error(`[Database] Failed to connect.`, err);

        return false;
    }
}

class db {
    cdb: any;
    database: string;
    namespace: string;

    constructor(cdb: any, namespace = 'golink', database = 'main'){
        this.cdb = cdb;
        this.namespace = namespace;
        this.database = database;
    }

    async create(type: string, id: number | string, obj: object){
        await sdb.use({
            namespace: this.namespace,
            database: this.database
        });

        try{
            await this.cdb.create(`${type}:${id}`, obj)
        } catch (err) {
            log(`[Database] Database error occured: ${err}`);
        }
    }

    async update(type: string, id: number | string, obj: object){
        await sdb.use({
            namespace: this.namespace,
            database: this.database
        });
        
        try{
            await this.cdb.update(`${type}:${id}`, obj);
        } catch (err) {
            log(`[Database] Database error occured: ${err}`, err);
        }
    }

    async get(type: string, id?: number | string){
        await sdb.use({
            namespace: this.namespace,
            database: this.database
        });
        
        try {
            const records = await this.cdb.select(`${type}${id ? `:${id}` : ``}`);
            return records.length < 2 ? (records.length === 0 ? undefined : records[0]) : records;
        } catch (err) {
            return {};
        }
    }

    async has(type: string, id: number | string){
        await sdb.use({
            namespace: this.namespace,
            database: this.database
        });
        
        try {
            if ((await this.cdb.select(`${type}:${id}`)).length === 0) return false;
            return true;
        } catch (err) {
            return false;
        }
    }

    async delete(type: string, id: number | string){
        await sdb.use({
            namespace: this.namespace,
            database: this.database
        });
        
        try{
            await this.cdb.delete(`${type}:${id}`);
        } catch (err) {
            log(`[Database] Database error occured: ${err}`);
        }
    }
}

export { initDB };