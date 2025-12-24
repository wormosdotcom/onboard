import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import fs from 'fs';
import * as schema from './schema.js';

const { Pool } = pg;

let pool = null;
let db = null;
let dbAvailable = false;

const getDatabaseUrl = () => {
    if (fs.existsSync('/tmp/replitdb')) {
        try {
            return fs.readFileSync('/tmp/replitdb', 'utf8').trim();
        } catch (e) {
            console.warn('Could not read /tmp/replitdb:', e.message);
        }
    }
    return process.env.DATABASE_URL;
};

const databaseUrl = getDatabaseUrl();

if (databaseUrl) {
    try {
        pool = new Pool({ 
            connectionString: databaseUrl,
            connectionTimeoutMillis: 10000
        });
        db = drizzle(pool, { schema });
        dbAvailable = true;
        console.log('Database connection configured');
    } catch (error) {
        console.error('Failed to configure database:', error.message);
    }
} else {
    console.warn('DATABASE_URL not set. Running without database.');
}

export { pool, db, dbAvailable };
