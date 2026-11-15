const db = require('better-sqlite3')('seca-saudavel.sqlite', { readonly: true });

console.log('COLUNAS DOS USUÁRIOS:');
console.log(db.prepare('PRAGMA table_info(users)').all().map(c => c.name));

console.log('\nCONTAS CADASTRADAS:');
console.table(db.prepare('SELECT * FROM users').all());

db.close();