/**
 * File templates emitted by `mediakit init`.
 *
 * The library provides the actual adapters (built-in `sqlite`, `postgres`,
 * `mysql`, `mongodb`) — the CLI no longer emits adapter source files for
 * those. All it produces is a reference SQL migration for users on Postgres
 * or MySQL who prefer a managed migration tool over `autoMigrate: true`.
 */

export function sqlMigrationTemplate(dialect: 'postgres' | 'mysql'): string {
  const header =
    dialect === 'mysql'
      ? `-- SQL migration for mediakit on MySQL / MariaDB.
-- MySQL 5.7 cannot DEFAULT on TEXT columns; if CREATE errors there,
-- drop the \`DEFAULT '{}'\` clauses on the JSON TEXT columns and set
-- defaults in application code.\n`
      : `-- SQL migration for mediakit on PostgreSQL.\n`

  return `${header}-- Apply once if you prefer not to use \`autoMigrate: true\`.

CREATE TABLE IF NOT EXISTS media (
  id                     TEXT        PRIMARY KEY,
  uuid                   TEXT        NOT NULL UNIQUE,
  model_type             TEXT        NOT NULL,
  model_id               TEXT        NOT NULL,
  collection_name        TEXT        NOT NULL DEFAULT 'default',
  name                   TEXT        NOT NULL,
  file_name              TEXT        NOT NULL,
  mime_type              TEXT        NOT NULL,
  disk                   TEXT        NOT NULL,
  conversions_disk       TEXT        NOT NULL,
  size                   INTEGER     NOT NULL DEFAULT 0,
  manipulations          TEXT        NOT NULL DEFAULT '{}',
  custom_properties      TEXT        NOT NULL DEFAULT '{}',
  generated_conversions  TEXT        NOT NULL DEFAULT '{}',
  responsive_images      TEXT        NOT NULL DEFAULT '{}',
  order_column           INTEGER     NOT NULL DEFAULT 0,
  status                 TEXT        NOT NULL DEFAULT 'ready',
  optimized_at           TEXT,
  created_at             TEXT        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TEXT        NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS media_owner_idx            ON media(model_type, model_id);
CREATE INDEX IF NOT EXISTS media_owner_collection_idx ON media(model_type, model_id, collection_name);
CREATE INDEX IF NOT EXISTS media_status_created_idx   ON media(status, created_at);
`
}
