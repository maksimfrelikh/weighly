import path from 'node:path';
import { defineConfig } from 'prisma/config';

// Prisma 7 moved the Migrate/introspection connection URL out of schema.prisma into here.
// This URL is used ONLY by the Prisma CLI (migrate diff shadow DB). The worker runtime
// never touches it — at runtime Prisma connects to D1 via @prisma/adapter-d1.
// The file: path is a throwaway local SQLite shadow DB, not a real database.
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
  },
  datasource: {
    url: 'file:./prisma/shadow.db',
  },
});
