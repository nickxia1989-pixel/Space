import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve("node_modules/app-builder-lib/out/util/electronGet.js");

if (!fs.existsSync(filePath)) {
  console.warn("electron-builder patch skipped: app-builder-lib is not installed.");
  process.exit(0);
}

let source = fs.readFileSync(filePath, "utf8");

if (source.includes("rename failed, copying extracted directory instead")) {
  console.log("electron-builder patch already applied.");
  process.exit(0);
}

const lockNeedle = `    const release = await lockfile.lock(tmpDir, {
        // 100 retries (not 15) so concurrent callers wait out a slow first extraction instead of failing
        // with ELOCKED; the update heartbeat keeps an in-progress holder's lock fresh against \`stale\`.
        retries: { retries: 100, minTimeout: 1000, maxTimeout: 5000 },
        stale: 120000, // Increased from 60s to allow long-running extractions
    });
    try {`;

const lockReplacement = `    const release = await lockfile.lock(tmpDir, {
        // 100 retries (not 15) so concurrent callers wait out a slow first extraction instead of failing
        // with ELOCKED; the update heartbeat keeps an in-progress holder's lock fresh against \`stale\`.
        retries: { retries: 100, minTimeout: 1000, maxTimeout: 5000 },
        stale: 120000, // Increased from 60s to allow long-running extractions
    });
    let releasedEarly = false;
    try {`;

const renameNeedle = `        await fs.rm(dir, { recursive: true, force: true });
        await fs.rename(tmpDir, dir);
    }
    finally {
        await release().catch(err => builder_util_1.log.warn({ err }, "failed to release lockfile"));
    }`;

const renameReplacement = `        await fs.rm(dir, { recursive: true, force: true });
        await release().catch(err => builder_util_1.log.warn({ err }, "failed to release lockfile before rename"));
        releasedEarly = true;
        let lastRenameError;
        for (let attempt = 0; attempt < 10; attempt++) {
            try {
                await fs.rename(tmpDir, dir);
                lastRenameError = undefined;
                break;
            }
            catch (e) {
                lastRenameError = e;
                if ((e === null || e === void 0 ? void 0 : e.code) !== "EPERM" && (e === null || e === void 0 ? void 0 : e.code) !== "EACCES" && (e === null || e === void 0 ? void 0 : e.code) !== "EBUSY") {
                    throw e;
                }
                await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
            }
        }
        if (lastRenameError) {
            builder_util_1.log.warn({ error: lastRenameError.message, from: tmpDir, to: dir }, "rename failed, copying extracted directory instead");
            await fs.cp(tmpDir, dir, { recursive: true, force: true });
            await fs.rm(tmpDir, { recursive: true, force: true }).catch(err => builder_util_1.log.warn({ err }, "failed to remove temporary extracted directory"));
        }
    }
    finally {
        if (!releasedEarly) {
            await release().catch(err => builder_util_1.log.warn({ err }, "failed to release lockfile"));
        }
    }`;

if (!source.includes(lockNeedle) || !source.includes(renameNeedle)) {
  throw new Error("electron-builder patch failed: target code shape did not match.");
}

source = source.replace(lockNeedle, lockReplacement).replace(renameNeedle, renameReplacement);
fs.writeFileSync(filePath, source);
console.log("electron-builder patch applied.");
