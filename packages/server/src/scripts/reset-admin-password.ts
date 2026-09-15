import bcrypt from 'bcryptjs';
import { loadConfig } from '../config';
import { migrate, one, openDatabase, run } from '../db';
import { nowLocal, setTimezone } from '../lib/time';

const [username = 'admin', password] = process.argv.slice(2);
if (!password || password.length < 6) {
  console.error('Usage: npm run admin:reset-password -- <username> <new-password (min 6 chars)>');
  process.exit(1);
}

const config = loadConfig();
setTimezone(config.timezone);
const db = openDatabase(config.dbPath);
migrate(db);

const user = one<{ id: number }>(db, 'SELECT id FROM users WHERE username = ?', [username]);
if (!user) {
  console.error(`User "${username}" not found`);
  process.exit(1);
}
run(
  db,
  `UPDATE users SET password_hash = ?, must_change_password = 1, is_active = 1, token_version = token_version + 1,
     updated_at = ? WHERE id = ?`,
  [bcrypt.hashSync(password, 10), nowLocal(), user.id],
);
run(db, 'INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, created_at) VALUES (NULL, ?, ?, ?, ?, ?)', [
  'system',
  'user.reset_password_cli',
  'user',
  user.id,
  nowLocal(),
]);
db.close();
console.log(`Password for "${username}" has been reset. The user must change it at next login.`);
