// Prisma CLI configuration — PostgreSQL (Neon) migration target.
// ============================================================================
// Required by Prisma 7: the datasource `url` was removed from schema.prisma and
// must be supplied here instead. Nothing in the running application reads this
// file — it configures the Prisma CLI only (validate / format / migrate /
// generate). The live system is MongoDB + Mongoose and stays authoritative
// until the Stage 4 read cutover. See DATABASE_MIGRATION_AUDIT.md.
//
// `datasource.url` intentionally uses DATABASE_URL, the DIRECT (non-pooled)
// Neon endpoint. Prisma Migrate needs a direct TCP connection; the pooled
// endpoint (DATABASE_URL_POOLED) is for the runtime client via a driver
// adapter and must not be used for migrations.
// ============================================================================
require('dotenv').config();

const { defineConfig, env } = require('prisma/config');

module.exports = defineConfig({
    schema: 'prisma/schema.prisma',
    migrations: {
        path: 'prisma/migrations',
    },
    datasource: {
        url: env('DATABASE_URL'),
    },
});
