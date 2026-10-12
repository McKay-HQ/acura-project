// Central configuration, read once from environment variables.
import fs from 'node:fs';
import path from 'node:path';

const env = process.env;
const bool = (v, dflt) => (v == null || v === '' ? dflt : !['false', '0', 'no', 'off'].includes(String(v).toLowerCase()));

/**
 * Database connection, from either:
 *   DATABASE_URL  postgres://user:pass@host:5432/db  (most managed providers give you this), or
 *   PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE   (the standard libpq variables).
 * TLS is controlled by DATABASE_SSL:
 *   disable    plain connection (the local Docker database)
 *   require    TLS with certificate verification (use DATABASE_SSL_CA for a private CA)
 *   no-verify  TLS without verifying the certificate (some providers use self-signed certs)
 * If DATABASE_SSL is not set, any sslmode=... in DATABASE_URL is used as-is.
 */
function databaseConfig() {
  const url = env.DATABASE_URL?.trim();
  if (!url && !env.PGHOST) {
    throw new Error('No database configured. Set DATABASE_URL (or PGHOST, PGUSER, PGPASSWORD, PGDATABASE).');
  }
  const mode = (env.DATABASE_SSL || '').trim().toLowerCase();
  let ssl;
  if (mode === 'disable' || mode === 'false') ssl = false;
  else if (mode === 'no-verify') ssl = { rejectUnauthorized: false };
  else if (mode === 'require' || mode === 'true' || mode === 'verify-full') {
    ssl = { rejectUnauthorized: true };
    const ca = env.DATABASE_SSL_CA?.trim();
    if (ca) ssl.ca = ca.includes('BEGIN CERTIFICATE') ? ca : fs.readFileSync(ca, 'utf8');
  } else if (mode) {
    throw new Error(`DATABASE_SSL must be disable, require or no-verify (got "${env.DATABASE_SSL}")`);
  }

  // When DATABASE_SSL is set it wins over any sslmode in the URL, so strip it from the URL.
  let connectionString = url;
  if (url && ssl !== undefined) {
    try {
      const u = new URL(url);
      ['sslmode', 'ssl', 'sslrootcert', 'sslcert', 'sslkey'].forEach((k) => u.searchParams.delete(k));
      connectionString = u.toString();
    } catch {
      /* leave non-URL connection strings untouched */
    }
  }
  return {
    connectionString: connectionString || undefined, // undefined → pg reads the PG* variables
    ...(ssl !== undefined ? { ssl } : {}),
    max: Number(env.DB_POOL_MAX || 10),
    connectionTimeoutMillis: Number(env.DB_CONNECT_TIMEOUT_MS || 10000),
  };
}

export const config = {
  port: Number(env.PORT || 3000),
  db: databaseConfig(),
  uploadDir: path.resolve(env.UPLOAD_DIR || './uploads'),
  // Photos are re-encoded server side: full size is capped at this many pixels on the long edge.
  photoMaxPx: Number(env.PHOTO_MAX_PX || 1600),
  thumbMaxPx: Number(env.THUMB_MAX_PX || 480),
  maxUploadMb: Number(env.MAX_UPLOAD_MB || 25),
  // Import seed/seed.json the first time the API starts against an empty database.
  seedOnEmpty: bool(env.SEED_ON_EMPTY, true),
  // When set, every change (POST/PATCH/PUT/DELETE) needs this key; see lib/auth.js.
  apiKey: (env.API_KEY || '').trim(),
  // When true (and API_KEY is set), reading data needs the key too.
  apiKeyForReads: bool(env.API_KEY_FOR_READS, false),
};

/** Safe description of where we connect, for startup logs (no password). */
export function describeDb() {
  const c = config.db;
  try {
    if (c.connectionString) {
      const u = new URL(c.connectionString);
      return `${u.hostname}:${u.port || 5432}${u.pathname}`;
    }
  } catch {
    /* fall through */
  }
  return `${env.PGHOST}:${env.PGPORT || 5432}/${env.PGDATABASE || ''}`;
}
