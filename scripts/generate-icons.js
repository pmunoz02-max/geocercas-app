import sharp from "sharp";
import { mkdir } from "fs/promises";
import path from "path";

const iconsDir = path.resolve("public/icons");

async function run() {
  await mkdir(iconsDir, { recursive: true });

  const base = path.join(iconsDir, "maskable-192.png");

  console.log("Generating icons from:", base);

  // icon-192.png (copy exact)
  await sharp(base)
    .resize(192, 192)
    .png()
    .toFile(path.join(iconsDir, "icon-192.png"));

  // icon-512.png
  await sharp(base)
    .resize(512, 512)
    .png()
    .toFile(path.join(iconsDir, "icon-512.png"));

  // maskable-512.png
  await sharp(base)
    .resize(512, 512)
    .png()
    .toFile(path.join(iconsDir, "maskable-512.png"));

  console.log("✅ Icons generated successfully");
}

run().catch((err) => {
  console.error("❌ Error generating icons", err);
  process.exit(1);
});
