import fs from "node:fs";

function loadEnvFile(path) {
  if (!fs.existsSync(path)) return;
  const lines = fs.readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    value = value.replace(/^["']|["']$/g, "");
    if (key && !process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env.production.local");

if (!process.env.NVIDIA_API_KEY) {
  console.error("NVIDIA_API_KEY is not set.");
  process.exit(1);
}

const response = await fetch("https://integrate.api.nvidia.com/v1/models", {
  headers: { Authorization: `Bearer ${process.env.NVIDIA_API_KEY}` },
});

const body = await response.json().catch(async () => ({ raw: await response.text() }));
console.log(`status ${response.status}`);
const models = Array.isArray(body.data) ? body.data : [];
const ids = models.map((model) => model.id || model.name || "").filter(Boolean).sort();

for (const id of ids) {
  console.log(id);
}

const vision = ids.filter((id) => /vl|vision|ocr|neva|kosmos|phi.*vision|llava/i.test(id));
if (vision.length) {
  console.log("\nvision candidates");
  for (const id of vision) console.log(id);
}
