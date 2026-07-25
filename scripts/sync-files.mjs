import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const srcDir = "F:\\فاروق\\farouq";
const destDir = "F:\\جعفر\\jaffer";

const filesToCopyDirect = [
    "styles.css",
    "firestore.rules",
    "server.js",
    "package.json",
    "sitemap.xml",
    "robots.txt",
    "metadata.json",
    "llms.txt",
    "firebase-blueprint.json"
];

const dirsToCopy = [
    "js",
    "scripts",
    "tests"
];

function copyDirRecursive(src, dest, excludeFiles = []) {
    if (!existsSync(dest)) {
        mkdirSync(dest, { recursive: true });
    }
    const entries = readdirSync(src);
    for (const entry of entries) {
        const srcPath = join(src, entry);
        const destPath = join(dest, entry);
        if (excludeFiles.includes(entry)) {
            console.log(`Skipping excluded file/dir: ${entry}`);
            continue;
        }
        const stat = statSync(srcPath);
        if (stat.isDirectory()) {
            copyDirRecursive(srcPath, destPath, excludeFiles);
        } else {
            copyFileSync(srcPath, destPath);
            console.log(`Copied: ${srcPath} -> ${destPath}`);
        }
    }
}

console.log(" Starting file sync from Farouq to Jaffer...");

for (const file of filesToCopyDirect) {
    const s = join(srcDir, file);
    const d = join(destDir, file);
    if (existsSync(s)) {
        copyFileSync(s, d);
        console.log(`Copied direct file: ${file}`);
    }
}

for (const dir of dirsToCopy) {
    const s = join(srcDir, dir);
    const d = join(destDir, dir);
    if (existsSync(s)) {
        // Exclude Jaffer's config.runtime.js so credentials are preserved
        copyDirRecursive(s, d, ["config.runtime.js"]);
    }
}

console.log(" File sync completed successfully!");
