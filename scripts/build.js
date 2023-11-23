import * as fs from 'fs';
import { exec } from 'child_process';

try {
    fs.rmSync('dist', { recursive: true });
    console.log(`[Build]`, `Removed old build.`);
} catch (error) {
    console.warn(`[Build]`, `Failed to remove old build:`, error.message);
}

await new Promise((resolve) => {
    exec('tsc', (error) => {
        if (error) {
            console.warn(`[Build]`, `Error while compiling TypeScript:`, error.message);
            resolve(error);
            return;
        }

        console.log(`[Build]`, `TypeScript compiled successfully.`);
        resolve();
    });
});

try {
    fs.copyFileSync('.env', 'dist/.env');
    console.log(`[Build]`, `Copied environment vars to the build.`);
} catch (error) {
    console.warn(`[Build]`, `Failed to copy environment vars to the build:`, error.message);
}

try {
    fs.copyFileSync('config.json', 'dist/config.json');
    console.log(`[Build]`, `Copied app configuration to the build.`);
} catch (error) {
    console.warn(`[Build]`, `Failed to copy app configuration to the build:`, error.message);
}