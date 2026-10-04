/** Runs before test files load — suppress dotenv 17 "injected env" / tip spam. */
process.env.DOTENV_CONFIG_QUIET = 'true';

/**
 * Main Jest suite mocks generated/prisma via moduleNameMapper and does not need
 * a live Neon DB. Provide a placeholder URL so prismaClient.js can construct
 * (the PrismaClient class is mocked; no TCP connection is opened).
 * Repository tests (node --test) set real secrets / .env and REPOSITORY_TEST=1.
 */
if (process.env.REPOSITORY_TEST !== '1') {
  if (!String(process.env.DATABASE_URL || '').trim()
      && !String(process.env.DATABASE_URL_POOLED || '').trim()) {
    process.env.DATABASE_URL = 'postgresql://jest:jest@127.0.0.1:5432/eonlinebazar_jest';
  }
  if (!String(process.env.DATABASE_URL_POOLED || '').trim()
      && String(process.env.DATABASE_URL || '').trim()) {
    process.env.DATABASE_URL_POOLED = process.env.DATABASE_URL;
  }
}
