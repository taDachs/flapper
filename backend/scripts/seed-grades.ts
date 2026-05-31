import "dotenv/config";
import pool from "../src/db/pool.js";
import migrate from "../src/db/runMigrate.js";

const DEFAULT_GRADES = [
  { name: "weiß", difficulty: 1, color: "#ffffff" },
  { name: "gelb", difficulty: 2, color: "#facc15" },
  { name: "grün", difficulty: 3, color: "#22c55e" },
  { name: "blau", difficulty: 4, color: "#3b82f6" },
  { name: "lila", difficulty: 5, color: "#a855f7" },
  { name: "rot", difficulty: 6, color: "#ef4444" },
  { name: "orange", difficulty: 7, color: "#f97316" },
  { name: "schwarz", difficulty: 8, color: "#1f2937" },
];

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
  const { email } = parseArgs();

  if (!email) {
    console.error("Usage: npm run seed-grades -- --email <email>");
    process.exit(1);
  }

  await migrate();

  const { rows } = await pool.query<{ id: number }>(
    "SELECT id FROM users WHERE email = $1",
    [email]
  );

  if (rows.length === 0) {
    console.error(`No user found with email: ${email}`);
    process.exit(1);
  }

  const userId = rows[0].id;

  // Check if grades already exist for this user
  const { rows: existing } = await pool.query<{ count: string }>(
    "SELECT COUNT(*) AS count FROM grades WHERE user_id = $1",
    [userId]
  );

  if (parseInt(existing[0].count, 10) > 0) {
    console.log(`Grades already seeded for user ${email}. Skipping.`);
    return;
  }

  for (const grade of DEFAULT_GRADES) {
    await pool.query(
      "INSERT INTO grades (user_id, name, difficulty, color) VALUES ($1, $2, $3, $4)",
      [userId, grade.name, grade.difficulty, grade.color]
    );
    console.log(`  + ${grade.name} (difficulty ${grade.difficulty})`);
  }

  console.log(`Seeded ${DEFAULT_GRADES.length} grades for user ${email}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => pool.end());
