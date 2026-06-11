'use strict';

/**
 * Minimal migration runner — applies the numbered .sql files in this directory
 * in lexicographic order and records each applied file in SCHEMA_MIGRATIONS so
 * re-runs skip them.
 *
 * Run (from the backend/ directory):
 *   npm run migrate                              ← locally with ./backend/.env loaded
 *   docker-compose exec backend npm run migrate  ← inside the running container
 *
 * Note: databases created by docker-compose already have all tables (schema.sql
 * runs via docker-entrypoint-initdb.d). Every migration uses CREATE TABLE IF
 * NOT EXISTS, so running this against such a database is a safe no-op that
 * simply backfills the SCHEMA_MIGRATIONS bookkeeping table.
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const MIGRATIONS_DIR = __dirname;

async function run() {
  // A dedicated connection (not the app pool) so we can enable
  // multipleStatements — each .sql file contains several statements.
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || process.env.DB_PASS, // both names supported
    multipleStatements: true,
  });

  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS SCHEMA_MIGRATIONS (
        migration_name VARCHAR(255) NOT NULL,
        applied_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (migration_name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const [rows] = await connection.query('SELECT migration_name FROM SCHEMA_MIGRATIONS');
    const applied = new Set(rows.map((r) => r.migration_name));

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let ran = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`= ${file} (already applied)`);
        continue;
      }
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      await connection.query(sql);
      await connection.query('INSERT INTO SCHEMA_MIGRATIONS (migration_name) VALUES (?)', [file]);
      console.log(`✓ ${file}`);
      ran++;
    }

    console.log(`Migrations complete (${ran} applied, ${files.length - ran} skipped).`);
  } finally {
    await connection.end();
  }
}

run().catch((err) => {
  console.error(`Migration failed: ${err.message}`);
  process.exit(1);
});
