import type { Database } from 'better-sqlite3';
import * as m001 from './001_init';
import * as m002 from './002_master_data';
import * as m003 from './003_customer_docs_images_zakat';

export interface Migration {
  version: number;
  name: string;
  up: (db: Database) => void;
}

export const migrations: Migration[] = [
  { version: 1, name: 'init', up: m001.up },
  { version: 2, name: 'master_data', up: m002.up },
  { version: 3, name: 'customer_docs_images_zakat', up: m003.up },
];
