import {
    copyFileSync,
    cpSync,
    existsSync,
    mkdirSync,
    rmSync,
    statSync,
} from "node:fs";
import { join } from "node:path";

const rootDir = process.cwd();
const outputDir = join(rootDir, "public");
const publicFiles = [
    "index.html",
    "styles.css",
    "robots.txt",
    "sitemap.xml",
    "llms.txt",
    "metadata.json",
];
const publicDirectories = ["assets", "js"];

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

for (const relativePath of publicFiles) {
    const source = join(rootDir, relativePath);
    if (!existsSync(source)) continue;
    copyFileSync(source, join(outputDir, relativePath));
}

for (const relativePath of publicDirectories) {
    const source = join(rootDir, relativePath);
    if (!existsSync(source)) continue;
    cpSync(source, join(outputDir, relativePath), { recursive: true });
}

const requiredFiles = [
    "index.html",
    "styles.css",
    "js/app.js",
    "js/firebase-bootstrap.js",
];

for (const relativePath of requiredFiles) {
    const outputPath = join(outputDir, relativePath);
    if (!existsSync(outputPath) || !statSync(outputPath).isFile()) {
        throw new Error(`Missing required build output: ${relativePath}`);
    }
}

console.log(`Static deployment created at ${outputDir}`);
