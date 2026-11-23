require('dotenv').config();

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { Pool } = require('pg');

const sqlitePath = path.join(__dirname, 'seca-saudavel.sqlite');

async function main() {
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('COLE_AQUI')) {
    throw new Error('DATABASE_URL não está configurada corretamente no .env.');
  }

  if (!fs.existsSync(sqlitePath)) {
    throw new Error(`Banco SQLite não encontrado: ${sqlitePath}`);
  }

  // Abre o banco antigo somente para leitura: o script não altera o SQLite.
  const sqlite = new Database(sqlitePath, { readonly: true, fileMustExist: true });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const users = sqlite.prepare(`
      SELECT id, name, email, password_hash, created_at
      FROM users ORDER BY id
    `).all();

    const subscriptions = sqlite.prepare(`
      SELECT id, user_id, mp_preapproval_id, status, init_point, updated_at
      FROM subscriptions ORDER BY id
    `).all();

    const gymData = sqlite.prepare(`
      SELECT user_id, data_json, updated_at
      FROM user_gym_data ORDER BY user_id
    `).all();

    console.log('Registros encontrados no SQLite:');
    console.log(`Usuários: ${users.length}`);
    console.log(`Assinaturas: ${subscriptions.length}`);
    console.log(`Dados da Academia: ${gymData.length}`);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Evita duplicar ou sobrescrever dados caso o script seja executado novamente.
      const targetCounts = await client.query(`
        SELECT
          (SELECT COUNT(*)::int FROM public.users) AS users,
          (SELECT COUNT(*)::int FROM public.subscriptions) AS subscriptions,
          (SELECT COUNT(*)::int FROM public.user_gym_data) AS gym
      `);
      const counts = targetCounts.rows[0];

      if (counts.users || counts.subscriptions || counts.gym) {
        throw new Error(
          `O Supabase já contém dados (users=${counts.users}, subscriptions=${counts.subscriptions}, gym=${counts.gym}). ` +
          'Migração interrompida para evitar duplicidade ou sobrescrita.'
        );
      }

      for (const row of users) {
        await client.query(
          `INSERT INTO public.users (id, name, email, password_hash, created_at)
           VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, NOW()))`,
          [row.id, row.name, row.email, row.password_hash, row.created_at]
        );
      }

      for (const row of subscriptions) {
        await client.query(
          `INSERT INTO public.subscriptions
             (id, user_id, mp_preapproval_id, status, init_point, updated_at)
           VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, NOW()))`,
          [row.id, row.user_id, row.mp_preapproval_id, row.status, row.init_point, row.updated_at]
        );
      }

      for (const row of gymData) {
        await client.query(
          `INSERT INTO public.user_gym_data (user_id, data_json, updated_at)
           VALUES ($1, $2, COALESCE($3::timestamptz, NOW()))`,
          [row.user_id, row.data_json || '{}', row.updated_at]
        );
      }

      // Ajusta as sequências para que novos IDs continuem após os IDs migrados.
      await client.query(`
        SELECT setval(
          pg_get_serial_sequence('public.users', 'id'),
          COALESCE((SELECT MAX(id) FROM public.users), 1),
          EXISTS (SELECT 1 FROM public.users)
        );
        SELECT setval(
          pg_get_serial_sequence('public.subscriptions', 'id'),
          COALESCE((SELECT MAX(id) FROM public.subscriptions), 1),
          EXISTS (SELECT 1 FROM public.subscriptions)
        );
      `);

      const verify = await client.query(`
        SELECT
          (SELECT COUNT(*)::int FROM public.users) AS users,
          (SELECT COUNT(*)::int FROM public.subscriptions) AS subscriptions,
          (SELECT COUNT(*)::int FROM public.user_gym_data) AS gym
      `);

      const finalCounts = verify.rows[0];
      if (
        finalCounts.users !== users.length ||
        finalCounts.subscriptions !== subscriptions.length ||
        finalCounts.gym !== gymData.length
      ) {
        throw new Error('A conferência de quantidades falhou. A transação será desfeita.');
      }

      await client.query('COMMIT');

      console.log('\nMigração concluída e conferida:');
      console.log(`Usuários no Supabase: ${finalCounts.users}`);
      console.log(`Assinaturas no Supabase: ${finalCounts.subscriptions}`);
      console.log(`Dados da Academia no Supabase: ${finalCounts.gym}`);
      console.log('\nO banco SQLite original não foi alterado.');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } finally {
    sqlite.close();
    await pool.end();
  }
}

main().catch(error => {
  console.error('\nMIGRAÇÃO NÃO CONCLUÍDA:');
  console.error(error.message);
  process.exitCode = 1;
});
