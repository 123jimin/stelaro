import {isAbsolute, join as pathJoin, resolve} from "node:path";

import {createFileReader, type FileReader} from "./reader.ts";
import {createFileWriter, type FileWriter} from "./writer.ts";

/** @category Fluent FS */
export type FluentPath = {
    readonly path: string;
    join(...segments: string[]): FluentPath;
    confine(...segments: string[]): FluentPath;
    read(): FileReader;
    write(): FileWriter;
};

/** @category Fluent FS */
export function fluentPath(base: string): FluentPath {
    return createFluentPath(resolve(base));
}

function createFluentPath(absolute_path: string): FluentPath {
    return {
        path: absolute_path,
        join(...segments: string[]) {
            return createFluentPath(pathJoin(absolute_path, ...segments));
        },
        confine(...segments: string[]) {
            return createFluentPath(confinePath(absolute_path, segments));
        },
        read() {
            return createFileReader(absolute_path);
        },
        write() {
            return createFileWriter(absolute_path);
        },
    };
}

function confinePath(base: string, segments: string[]): string {
    const parts: string[] = [];

    for(const segment of segments) {
        if(isAbsolute(segment)) {
            parts.length = 0;
        }

        for(const part of segment.split(/[/\\]/)) {
            if(part === "" || part === ".") continue;
            if(part === "..") {
                if(parts.length > 0) parts.pop();
                continue;
            }
            if(/^[a-zA-Z]:$/.test(part)) continue;
            parts.push(part);
        }
    }

    return parts.length === 0 ? base : pathJoin(base, ...parts);
}
