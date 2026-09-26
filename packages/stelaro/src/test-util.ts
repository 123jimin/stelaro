import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {afterEach, beforeEach} from "node:test";

import type {Promisable} from "@jiminp/tooltool";
import {type as schema} from "arktype";

import {defineComponent, defineComponentCalls} from "./component/component.ts";
import type {Logger, LoggerFactory} from "./component/logger.ts";
import type {AnyComponentCalls, ComponentCalls, ComponentId} from "./component/types.ts";

export const EmptyInput = schema({});
export const CounterOutput = schema({count: "number"});
export const SetCounterInput = schema({count: "number"});
export const RenderOutput = schema({html: "string"});

export function createTempDir(prefix: string): Promise<string> {
    return mkdtemp(join(tmpdir(), `stelaro-${prefix}-`));
}

export async function writeTestFile(file_path: string, content: string): Promise<void> {
    await mkdir(dirname(file_path), {recursive: true});
    await writeFile(file_path, content);
}

/** Creates a fresh temp directory before each test, removes it after, and returns its getter. */
export function useTempDir(prefix: string): () => string {
    let dir: string | null = null;

    beforeEach(async () => {
        dir = await createTempDir(prefix);
    });

    afterEach(async () => {
        const current = dir;
        dir = null;
        if(current != null) await rm(current, {recursive: true, force: true});
    });

    return () => {
        if(dir == null) throw new Error("useTempDir() directory is only available inside a test.");
        return dir;
    };
}

const noop = (): void => {};
const noop_logger: Logger = {debug: noop, info: noop, warn: noop, error: noop};

/** Logger factory that discards every record. */
export const noopLoggerFactory: LoggerFactory = () => noop_logger;

const counter_call_declarations = {
    current: {input: EmptyInput, output: CounterOutput},
    increment: {input: EmptyInput, output: CounterOutput},
};

export type CounterCalls<TId extends ComponentId> = ComponentCalls<TId, typeof counter_call_declarations>;

/** Defines a counter call surface with `current` and `increment`. */
export function defineCounterCalls<const TId extends ComponentId>(id: TId): CounterCalls<TId> {
    return defineComponentCalls(id, counter_call_declarations);
}

export type CounterComponentOptions<TUses extends readonly AnyComponentCalls[]> = {
    readonly uses?: TUses;
    readonly start?: () => Promisable<void>;
    readonly stop?: () => Promisable<void>;
};

/** Defines a stateful counter component (starting at 0) implementing {@link defineCounterCalls}. */
export function defineCounterComponent<
    const TId extends ComponentId,
    const TUses extends readonly AnyComponentCalls[] = readonly [],
>(calls: CounterCalls<TId>, {uses, start, stop}: CounterComponentOptions<TUses> = {}) {
    return defineComponent({
        calls,
        uses: uses ?? ([] as readonly AnyComponentCalls[] as TUses),
        state: () => ({count: 0}),
        handlers: {
            current: ({state}) => ({count: state.count}),
            increment: ({state}) => {
                state.count += 1;
                return {count: state.count};
            },
        },
        ...(start != null ? {start} : null),
        ...(stop != null ? {stop} : null),
    });
}
