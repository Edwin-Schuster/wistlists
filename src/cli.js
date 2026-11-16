#!/usr/bin/env node
// User admin CLI.
//   npm run user -- list
//   npm run user -- add <username> "<Display Name>" <password>
//   npm run user -- reset-password <username> <new-password>
//   npm run user -- remove <username>
// In Docker: docker compose exec wishlist npm run user -- <command> ...
const db = require('./db');
const auth = require('./auth');

const [cmd, ...args] = process.argv.slice(2);

function usage(code = 1) {
  console.log(`Usage:
  npm run user -- list
  npm run user -- add <username> "<Display Name>" <password>
  npm run user -- reset-password <username> <new-password>
  npm run user -- remove <username>`);
  process.exit(code);
}

function findUser(username) {
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || ''));
  if (!u) {
    console.error(`No user called "${username}"`);
    process.exit(1);
  }
  return u;
}

try {
  switch (cmd) {
    case 'list': {
      const rows = db
        .prepare(
          `SELECT u.username, u.display_name, u.avatar, COUNT(i.id) AS items
           FROM users u LEFT JOIN items i ON i.user_id = u.id GROUP BY u.id ORDER BY u.id`
        )
        .all();
      if (!rows.length) console.log('No users yet.');
      for (const r of rows) console.log(`${r.avatar} ${r.username.padEnd(16)} ${r.display_name.padEnd(20)} ${r.items} item(s)  /list/${r.username}`);
      break;
    }
    case 'add': {
      const [username, displayName, password] = args;
      if (!username || !password) usage();
      auth.createUser(username, displayName || username, password);
      console.log(`Created "${username}". Their public list is /list/${username.toLowerCase()}`);
      break;
    }
    case 'reset-password':
    case 'passwd': {
      const [username, password] = args;
      if (!username || !password) usage();
      const u = findUser(username);
      auth.setPassword(u.id, password);
      console.log(`Password for "${u.username}" updated. They have been logged out everywhere.`);
      break;
    }
    case 'remove': {
      const u = findUser(args[0]);
      db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
      console.log(`Removed "${u.username}" and their list.`);
      break;
    }
    case 'help':
    case '--help':
    case '-h':
      usage(0);
      break;
    default:
      usage();
  }
} catch (e) {
  console.error(`Error: ${e.message}`);
  process.exit(1);
}
