import dotenv from "dotenv";
import { createApp } from "./app.js";

dotenv.config();

const SERVICE_NAME = "story-sleuth-backend";
const PORT = Number(process.env.PORT ?? 5060);

const app = createApp();
app.listen(PORT, () => {
  console.log(`[${SERVICE_NAME}] listening on :${PORT}`);
});
