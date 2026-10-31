// The assets rule of nest-cli.json, for `npm run build`: the build runs tsc 7 directly because the
// Nest CLI's builder still needs the 6.0 compiler API. Copies src/i18n/**/*.json to dist/i18n/.
import { cpSync } from 'node:fs';

cpSync('src/i18n', 'dist/i18n', { recursive: true, filter: (p) => !/\.[^/]+$/.test(p) || p.endsWith('.json') });
