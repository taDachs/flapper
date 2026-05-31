import "dotenv/config";
import argon2 from "argon2";
import pool from "../src/db/pool.js";
import migrate from "../src/db/runMigrate.js";

function parseArgs() {
  const args = process.argv.slice(2);
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--") && i + 1 < args.length) {
      result[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }
  return result;
}

async function main() {
  const { email, password } = parseArgs();

  if (!email || !password) {
    console.error("Usage: npm run create-user -- --email <email> --password <password>");
    process.exit(1);
  }

  await migrate();

  const hash = await argon2.hash(password);
  const { rows } = await pool.query<{ id: number }>(
    "INSERT INTO users (email, password_hash) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING RETURNING id",
    [email, hash]
  );

  if (rows.length === 0) {
    console.error(`User with email ${email} already exists.`);
    process.exit(1);
  }

  console.log(`Created user: ${email} (id=${rows[0].id})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => pool.end());
