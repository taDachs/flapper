import "dotenv/config";
import { createApp } from "./createApp.js";
import migrate from "./db/runMigrate.js";

const PORT = process.env.PORT ?? 3000;

async function start() {
  await migrate();
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`Backend listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("Startup failed:", err);
  process.exit(1);
});
