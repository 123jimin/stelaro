#!/usr/bin/env node
// @ts-check

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';
import {fileURLToPath} from 'node:url';

/**
 * @param {Record<string, unknown>} pkg Parsed package.json content.
 * @returns {boolean} True if the project has already been bootstrapped.
 */
function isBootstrapped(pkg) {
    return pkg.name !== 'placeholder-name' || pkg.author !== 'placeholder-author';
}

/**
 * @param {string} message
 * @returns {void}
 */
function print(message) {
    globalThis.console.log(message);
}

/**
 * @param {readline.Interface} rl Readline interface.
 * @param {string} query Prompt shown to the user.
 * @returns {Promise<string>} User input.
 */
function ask(rl, query) {
    return new Promise((resolve) => {
        rl.question(query, resolve);
    });
}

/**
 * @param {string} type
 * @param {string} author
 * @param {number} year
 * @returns {string|null}
 */
function getLicenseText(type, author, year) {
    switch(type.trim().toLowerCase()) {
        case 'mit':
            return `MIT License

Copyright (c) ${year} ${author}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
        case 'wtfpl':
            return `            DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE
                    Version 2, December 2004

 Copyright (C) ${year} ${author}

 Everyone is permitted to copy and distribute verbatim or modified
 copies of this license document, and changing it is allowed as long
 as the name is changed.

            DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE
   TERMS AND CONDITIONS FOR COPYING, DISTRIBUTION AND MODIFICATION

  0. You just DO WHAT THE FUCK YOU WANT TO.
  `;
        case 'unlicense':
            return `This is free and unencumbered software released into the public domain.

Anyone is free to copy, modify, publish, use, compile, sell, or
distribute this software, either in source code form or as a compiled
binary, for any purpose, commercial or non-commercial, and by any
means.

In jurisdictions that recognize copyright laws, the author or authors
of this software dedicate any and all copyright interest in the
software to the public domain. We make this dedication for the benefit
of the public at large and to the detriment of our heirs and
successors. We intend this dedication to be an overt act of
relinquishment in perpetuity of all present and future rights to this
software under copyright law.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR
OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.

For more information, please refer to <https://unlicense.org>
`;
        default:
            return null;
    }
}

/**
 * @param {string} project_name
 * @param {string} project_desc
 * @param {string} license
 */
function getReadmeText(project_name, project_desc, license) {
    return `# ${project_name}

${project_desc || "(No description provided.)"}

## Finishing the Setup

1. Review \`package.json\` and \`LICENSE\` to ensure correctness.
2. Install dependencies with \`pnpm install\`.
    - It is recommended to also run \`pnpm up --latest\` to update dependencies to their latest versions.
3. Remove this section.

## Development

This project uses [pnpm](https://pnpm.io/) for package management.

- \`pnpm build\` – compile TypeScript from \`src/\` into \`dist/\`.
  - \`pnpm build:watch\` – recompile on every file change.
- \`pnpm test\` – run unit tests from \`src/**/*.spec.ts\`.
  - Don't forget to run \`pnpm build\` before running tests!
- \`pnpm lint\` – run ESLint on the source code.
- \`pnpm clean\` – remove the \`dist/\` directory.

## License

[${license}](./LICENSE)
`;
}

/**
 * @param {string} file_name
 * @param {string} contents
 */
async function writeFile(file_name, contents) {
    await fs.writeFile(path.join(process.cwd(), file_name), contents, 'utf-8');
}

async function selfDestruct() {
    await fs.unlink(fileURLToPath(import.meta.url));
}

async function main() {
    const pkg = /** @type {Record<string, unknown>} */ (JSON.parse(await fs.readFile(path.join(process.cwd(), "package.json"), 'utf-8')));
    if(isBootstrapped(pkg)) {
        globalThis.console.error("This project has already been bootstrapped.");
        process.exit(1);
    }

    print("Let me help you bootstrap your project.\n");

    const rl = readline.createInterface({input: process.stdin, output: process.stdout});
    const project_name = await ask(rl, "Project name: ");
    const project_desc = await ask(rl, "Project description (optional): ");
    const author_name = await ask(rl, "Your name: ");
    const github_repo = await ask(rl, "GitHub repository ID (e.g. `username/repo`) (optional): ");
    const license = (await ask(rl, "License ID: "));
    rl.close();

    pkg.name = project_name.trim() || pkg.name;
    pkg.description = project_desc.trim() || pkg.description;
    pkg.author = author_name.trim() || pkg.author;
    pkg.license = license.trim() || pkg.license;

    if(github_repo) {
        pkg.repository = {type: 'git', url: `git+https://github.com/${github_repo}.git`};
        pkg.bugs = {url: `https://github.com/${github_repo}/issues`};
        pkg.homepage = `https://github.com/${github_repo}`;
    } else {
        delete pkg.repository;
        delete pkg.bugs;
        delete pkg.homepage;
    }

    const year = (new Date()).getFullYear();
    let license_text = getLicenseText(license, author_name, year);

    if(license_text == null) {
        print("Unknown license ID. Please fill-in the LICENSE file manually.");
        license_text = "TODO: Fill-in the license text.\n";
    }

    const readme_text = getReadmeText(project_name, project_desc, license);

    await Promise.all([
        writeFile("LICENSE", license_text),
        writeFile("README.md", readme_text),
        writeFile("package.json", JSON.stringify(pkg, null, 2) + "\n"),
    ]);

    await selfDestruct();

    print("\nBootstrap complete. Follow additional instructions in README.md!");
}

main().catch((err) => globalThis.console.error(err));
