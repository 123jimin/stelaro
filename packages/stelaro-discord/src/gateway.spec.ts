import assert from "node:assert/strict";
import {EventEmitter} from "node:events";
import {describe, it, type TestContext} from "node:test";
import {setImmediate} from "node:timers/promises";

import {defineComponentCalls, UserFacingError} from "@jiminp/stelaro";
import {type as schema} from "arktype";
import {
    ApplicationCommandType,
    type Client,
    ContextMenuCommandBuilder,
    Events,
    MessageFlags,
    REST,
    Routes,
    SlashCommandBuilder,
} from "discord.js";

import {
    command,
    defineDiscordGateway,
    defineDiscordMounts,
    type DiscordGatewayDefinition,
    event,
    type Guard,
    interaction,
} from "./index.ts";

type Sent = {readonly method: "reply" | "followUp" | "respond"; readonly payload: unknown};
type InteractionKind = "chat_input" | "context_menu" | "autocomplete" | "button";
type Listener = (...args: unknown[]) => unknown;

/** A discord.js client stand-in: a plain EventEmitter with stubbed `login` and `destroy`. */
class FakeClient extends EventEmitter {
    login_error: unknown = null;
    destroyed = false;

    async login(token: string): Promise<string> {
        if(this.login_error != null) throw this.login_error;
        return token;
    }

    async destroy(): Promise<void> {
        await setImmediate();
        this.destroyed = true;
    }
}

function lifecycleContext<T>(context: unknown): T {
    return context as T;
}

/** Starts a gateway on a fake client with stubbed command registration and a logger capturing only errors. */
async function startGateway(
    t: TestContext,
    definition: Pick<DiscordGatewayDefinition, "mounts" | "guards">,
    config: {readonly guild_id?: string} = {},
) {
    const client = new FakeClient();
    const registrations: {readonly route: string; readonly body: unknown}[] = [];
    t.mock.method(REST.prototype, "put", (route: string, options?: {body?: unknown}) => {
        registrations.push({route, body: options?.body});
        return Promise.resolve([]);
    });

    const gateway = defineDiscordGateway({id: "discord", client: client as unknown as Client, uses: [], ...definition});
    const errors: unknown[][] = [];
    const context = {
        config: {application_id: "app-1", ...config},
        secrets: {token: "token-1"},
        log: {debug() {}, info() {}, warn() {}, error: (...args: unknown[]) => { errors.push(args); }},
        call: () => Promise.reject(new Error("Unexpected call.")),
    };

    assert.ok(gateway.start);
    await gateway.start(lifecycleContext(context));
    return {client, gateway, context, errors, registrations};
}

/** Invokes every listener for `type` and waits for all of them to settle. */
async function emit(client: FakeClient, type: string, ...args: unknown[]): Promise<void> {
    await Promise.all((client.listeners(type) as Listener[]).map((listener) => listener(...args)));
}

function stubInteraction(kind: InteractionKind, fields: Record<string, unknown>) {
    const sent: Sent[] = [];
    const record = (method: Sent["method"]) => (payload: unknown) => {
        sent.push({method, payload});
        return Promise.resolve();
    };
    const stub = {
        user: {id: "user-1"},
        guildId: "guild-1",
        channelId: "channel-1",
        replied: false,
        deferred: false,
        isChatInputCommand: () => kind === "chat_input",
        isContextMenuCommand: () => kind === "context_menu",
        isAutocomplete: () => kind === "autocomplete",
        isButton: () => kind === "button",
        isStringSelectMenu: () => false,
        isModalSubmit: () => false,
        isRepliable: () => kind !== "autocomplete",
        reply: record("reply"),
        followUp: record("followUp"),
        respond: record("respond"),
        ...fields,
    };
    return {interaction: stub, sent};
}

function slashInteraction(name: string, fields: Record<string, unknown> = {}) {
    return stubInteraction("chat_input", {
        commandName: name,
        commandType: ApplicationCommandType.ChatInput,
        options: {data: []},
        ...fields,
    });
}

function autocompleteInteraction(
    name: string,
    focused: {readonly name: string; readonly value: string},
    subcommand: string | null = null,
) {
    return stubInteraction("autocomplete", {
        commandName: name,
        commandType: ApplicationCommandType.ChatInput,
        options: {getFocused: () => focused, getSubcommand: () => subcommand},
    });
}

function buttonInteraction(custom_id: string) {
    return stubInteraction("button", {customId: custom_id});
}

function slashData(name: string) {
    return new SlashCommandBuilder().setName(name).setDescription(name);
}

function searchData() {
    return slashData("search").addStringOption((option) => option
        .setName("query")
        .setDescription("Query")
        .setAutocomplete(true));
}

const EPHEMERAL_REPLY = {method: "reply", payload: {content: "Nope", flags: MessageFlags.Ephemeral}} as const;

describe("handler call typing", () => {
    it("rejects inline handler calls outside the mount's `uses` at the type level, alongside helper-defined handlers", () => {
        const CounterCalls = defineComponentCalls("counter", {current: {input: schema({}), output: schema("number")}});
        const GreeterCalls = defineComponentCalls("greeter", {greet: {input: schema("string"), output: schema("string")}});

        defineDiscordMounts({
            uses: [CounterCalls],
            commands: [
                command({data: slashData("ping"), handle() {}}),
                {
                    data: slashData("count"),
                    async handle({call}) {
                        await call(CounterCalls.calls.current, {});
                        // @ts-expect-error -- GreeterCalls is not in the mount's `uses`
                        await call(GreeterCalls.calls.greet, "a");
                    },
                },
            ],
        });
    });
});

describe("defineDiscordGateway", () => {
    it("registers every command guild-scoped when guild_id is set, otherwise globally", async (t) => {
        const mounts = [defineDiscordMounts({
            uses: [],
            commands: [
                command({data: slashData("ping"), handle() {}}),
                command({data: new ContextMenuCommandBuilder().setName("Inspect").setType(ApplicationCommandType.User), handle() {}}),
            ],
        })];

        const guild = await startGateway(t, {mounts}, {guild_id: "guild-9"});
        const global = await startGateway(t, {mounts});

        assert.deepStrictEqual(guild.registrations.map(({route}) => route), [Routes.applicationGuildCommands("app-1", "guild-9")]);
        assert.deepStrictEqual(global.registrations.map(({route}) => route), [Routes.applicationCommands("app-1")]);
        const names = (guild.registrations[0]!.body as {name: string}[]).map(({name}) => name);
        assert.deepStrictEqual(names.sort(), ["Inspect", "ping"]);
    });

    it("rejects two commands with the same type and name, even across mounts", () => {
        const mount = () => defineDiscordMounts({uses: [], commands: [command({data: slashData("ping"), handle() {}})]});

        assert.throws(() => defineDiscordGateway({
            id: "discord",
            client: new FakeClient() as unknown as Client,
            uses: [],
            mounts: [mount(), mount()],
        }));
    });

    it("dispatches a slash command and a context-menu command sharing a name by command type", async (t) => {
        const handled: string[] = [];
        const {client} = await startGateway(t, {
            mounts: [defineDiscordMounts({
                uses: [],
                commands: [
                    command({data: slashData("info"), handle() { handled.push("slash"); }}),
                    command({
                        data: new ContextMenuCommandBuilder().setName("info").setType(ApplicationCommandType.User),
                        handle() { handled.push("user menu"); },
                    }),
                ],
            })],
        });

        const {interaction: menu} = stubInteraction("context_menu", {commandName: "info", commandType: ApplicationCommandType.User});
        await emit(client, Events.InteractionCreate, menu);
        await emit(client, Events.InteractionCreate, slashInteraction("info").interaction);

        assert.deepStrictEqual(handled, ["user menu", "slash"]);
    });

    for(const pattern of ["vote:opt{id}", "vote:{user-id}", "vote:{id}:{id}", "vote:}"]) {
        it(`rejects the malformed interaction pattern "${pattern}"`, () => {
            assert.throws(() => defineDiscordGateway({
                id: "discord",
                client: new FakeClient() as unknown as Client,
                uses: [],
                mounts: [defineDiscordMounts({uses: [], interactions: [interaction({pattern, handle() {}})]})],
            }));
        });
    }
});

describe("guards", () => {
    function recordingGuard(order: string[], label: string, reject = false): Guard {
        return () => {
            order.push(label);
            if(reject) throw new UserFacingError("Nope");
        };
    }

    it("runs gateway, mount, then handler guards before the handler", async (t) => {
        const order: string[] = [];
        const {client} = await startGateway(t, {
            guards: [recordingGuard(order, "gateway")],
            mounts: [defineDiscordMounts({
                uses: [],
                guards: [recordingGuard(order, "mount")],
                commands: [command({
                    data: slashData("ping"),
                    guards: [recordingGuard(order, "command")],
                    handle() { order.push("handler"); },
                })],
            })],
        });

        await emit(client, Events.InteractionCreate, slashInteraction("ping").interaction);

        assert.deepStrictEqual(order, ["gateway", "mount", "command", "handler"]);
    });

    it("stops at the first rejecting guard and replies with its message ephemerally", async (t) => {
        const order: string[] = [];
        const {client} = await startGateway(t, {
            guards: [recordingGuard(order, "gateway")],
            mounts: [defineDiscordMounts({
                uses: [],
                guards: [recordingGuard(order, "mount", true)],
                commands: [command({
                    data: slashData("ping"),
                    guards: [recordingGuard(order, "command")],
                    handle() { order.push("handler"); },
                })],
            })],
        });
        const {interaction: ping, sent} = slashInteraction("ping");

        await emit(client, Events.InteractionCreate, ping);

        assert.deepStrictEqual(order, ["gateway", "mount"]);
        assert.deepStrictEqual(sent, [EPHEMERAL_REPLY]);
    });

    it("answers an autocomplete guard rejection with empty choices, skipping the handler", async (t) => {
        const order: string[] = [];
        const {client} = await startGateway(t, {
            mounts: [defineDiscordMounts({
                uses: [],
                guards: [recordingGuard(order, "mount", true)],
                commands: [command({
                    data: searchData(),
                    handle() {},
                    autocomplete: {query: () => { order.push("autocomplete"); return ["a"]; }},
                })],
            })],
        });
        const {interaction: typing, sent} = autocompleteInteraction("search", {name: "query", value: "a"});

        await emit(client, Events.InteractionCreate, typing);

        assert.deepStrictEqual(order, ["mount"]);
        assert.deepStrictEqual(sent, [{method: "respond", payload: []}]);
    });
});

describe("limits", () => {
    it("rejects a command over its rate limit with an ephemeral reply, skipping the handler", async (t) => {
        let handled = 0;
        const {client} = await startGateway(t, {
            mounts: [defineDiscordMounts({
                uses: [],
                commands: [command({
                    data: slashData("ping"),
                    rate_limit: {limit: 1, window_ms: 60_000},
                    handle() { handled++; },
                })],
            })],
        });
        const first = slashInteraction("ping");
        const second = slashInteraction("ping");

        await emit(client, Events.InteractionCreate, first.interaction);
        await emit(client, Events.InteractionCreate, second.interaction);

        assert.strictEqual(handled, 1);
        assert.deepStrictEqual(first.sent, []);
        assert.deepStrictEqual(second.sent.map(({method}) => method), ["reply"]);
        assert.strictEqual((second.sent[0]!.payload as {flags?: unknown}).flags, MessageFlags.Ephemeral);
    });

    it("rate-limits autocomplete separately from its command", async (t) => {
        const {client} = await startGateway(t, {
            mounts: [defineDiscordMounts({
                uses: [],
                commands: [command({
                    data: searchData(),
                    rate_limit: {limit: 1, window_ms: 60_000},
                    handle() {},
                    autocomplete: {query: () => ["a"]},
                })],
            })],
        });
        await emit(client, Events.InteractionCreate, slashInteraction("search").interaction);
        await emit(client, Events.InteractionCreate, slashInteraction("search").interaction);
        const first = autocompleteInteraction("search", {name: "query", value: "a"});
        const second = autocompleteInteraction("search", {name: "query", value: "a"});

        await emit(client, Events.InteractionCreate, first.interaction);
        await emit(client, Events.InteractionCreate, second.interaction);

        assert.deepStrictEqual(first.sent, [{method: "respond", payload: [{name: "a", value: "a"}]}]);
        assert.deepStrictEqual(second.sent, [{method: "respond", payload: []}]);
    });

    it("releases the concurrency slot when the handler throws", {timeout: 2_000}, async (t) => {
        let calls = 0;
        const {client} = await startGateway(t, {
            mounts: [defineDiscordMounts({
                uses: [],
                commands: [command({
                    data: slashData("ping"),
                    concurrency: {max: 1},
                    handle() {
                        calls++;
                        if(calls === 1) throw new Error("Boom.");
                    },
                })],
            })],
        });

        await emit(client, Events.InteractionCreate, slashInteraction("ping").interaction);
        await emit(client, Events.InteractionCreate, slashInteraction("ping").interaction);

        assert.strictEqual(calls, 2);
    });
});

describe("handler errors", () => {
    async function startThrowing(t: TestContext, error: unknown) {
        return startGateway(t, {
            mounts: [defineDiscordMounts({
                uses: [],
                commands: [command({data: slashData("ping"), handle() { throw error; }})],
            })],
        });
    }

    it("replies to a UserFacingError ephemerally when the interaction is fresh", async (t) => {
        const {client} = await startThrowing(t, new UserFacingError("Nope"));
        const {interaction: ping, sent} = slashInteraction("ping");

        await emit(client, Events.InteractionCreate, ping);

        assert.deepStrictEqual(sent, [EPHEMERAL_REPLY]);
    });

    for(const state of [{deferred: true}, {replied: true}]) {
        it(`follows up on a UserFacingError when the interaction is ${Object.keys(state)[0]}`, async (t) => {
            const {client} = await startThrowing(t, new UserFacingError("Nope"));
            const {interaction: ping, sent} = slashInteraction("ping", state);

            await emit(client, Events.InteractionCreate, ping);

            assert.deepStrictEqual(sent, [{...EPHEMERAL_REPLY, method: "followUp"}]);
        });
    }

    it("logs other errors without replying", async (t) => {
        const error = new Error("Boom.");
        const {client, errors} = await startThrowing(t, error);
        const {interaction: ping, sent} = slashInteraction("ping");

        await emit(client, Events.InteractionCreate, ping);

        assert.deepStrictEqual(sent, []);
        assert.ok(errors.some((args) => args.includes(error)));
    });
});

describe("persistent interactions", () => {
    it("routes a custom id to the matching pattern with its params", async (t) => {
        const handled: unknown[] = [];
        const {client} = await startGateway(t, {
            mounts: [defineDiscordMounts({
                uses: [],
                interactions: [
                    interaction({pattern: "quote:delete:{quote_id}", handle({params}) { handled.push(["delete", params]); }}),
                    interaction({pattern: "quote:list:{user}:{page}", handle({params}) { handled.push(["list", params]); }}),
                ],
            })],
        });

        await emit(client, Events.InteractionCreate, buttonInteraction("quote:list:u-1:2").interaction);
        await emit(client, Events.InteractionCreate, buttonInteraction("quote:list:u-1").interaction);
        await emit(client, Events.InteractionCreate, buttonInteraction("quote:remove:q-1").interaction);

        assert.deepStrictEqual(handled, [["list", {user: "u-1", page: "2"}]]);
    });
});

describe("autocomplete", () => {
    it("ellipsizes names to 100 characters, cuts values to their 100-character prefix, and keeps at most 25 choices", async (t) => {
        const long = "abcdefghij".repeat(15);
        const {client} = await startGateway(t, {
            mounts: [defineDiscordMounts({
                uses: [],
                commands: [command({
                    data: searchData(),
                    handle() {},
                    autocomplete: {query: () => [long, ...Array.from({length: 29}, (_, i) => `${i}`)]},
                })],
            })],
        });
        const {interaction: typing, sent} = autocompleteInteraction("search", {name: "query", value: ""});

        await emit(client, Events.InteractionCreate, typing);

        const choices = sent[0]!.payload as {name: string; value: string}[];
        assert.strictEqual(choices.length, 25);
        assert.ok(choices[0]!.name.length <= 100);
        assert.strictEqual(choices[0]!.value, long.slice(0, 100));
        assert.deepStrictEqual(choices[1], {name: "0", value: "0"});
    });

    it("answers a subcommand option from its `subcommand/option` map handler", async (t) => {
        const {client} = await startGateway(t, {
            mounts: [defineDiscordMounts({
                uses: [],
                commands: [command({
                    data: slashData("quote").addSubcommand((sub) => sub
                        .setName("search")
                        .setDescription("Search")
                        .addStringOption((option) => option.setName("query").setDescription("Query").setAutocomplete(true))),
                    handle() {},
                    autocomplete: {"search/query": ({value}) => [`${value}!`]},
                })],
            })],
        });
        const {interaction: typing, sent} = autocompleteInteraction("quote", {name: "query", value: "a"}, "search");

        await emit(client, Events.InteractionCreate, typing);

        assert.deepStrictEqual(sent, [{method: "respond", payload: [{name: "a!", value: "a!"}]}]);
    });

    it("hands a single autocomplete handler the interaction and leaves the response to it", async (t) => {
        const received: unknown[] = [];
        const {client} = await startGateway(t, {
            mounts: [defineDiscordMounts({
                uses: [],
                commands: [command({
                    data: searchData(),
                    handle() {},
                    autocomplete: ({interaction: typing}) => { received.push(typing); },
                })],
            })],
        });
        const {interaction: typing, sent} = autocompleteInteraction("search", {name: "query", value: "a"});

        await emit(client, Events.InteractionCreate, typing);

        assert.deepStrictEqual(received, [typing]);
        assert.deepStrictEqual(sent, []);
    });
});

describe("events", () => {
    it("runs every handler of an event even when a sibling throws, logging the rejection", async (t) => {
        const error = new Error("Boom.");
        const received: unknown[] = [];
        const {client, errors} = await startGateway(t, {
            mounts: [defineDiscordMounts({
                uses: [],
                events: [
                    event({type: Events.MessageCreate, handle() { throw error; }}),
                    event({type: Events.MessageCreate, handle({event: args}) { received.push(args); }}),
                ],
            })],
        });
        const message = {id: "message-1"};

        await emit(client, Events.MessageCreate, message);

        assert.deepStrictEqual(received, [[message]]);
        assert.ok(errors.some((args) => args.includes(error)));
    });
});

describe("lifecycle", () => {
    const mounts = [defineDiscordMounts({
        uses: [],
        events: [event({type: Events.MessageCreate, handle() {}})],
    })];

    it("stop removes only the gateway's listeners and waits for the client to be destroyed", async (t) => {
        const foreign = () => {};
        const {client, gateway, context} = await startGateway(t, {mounts});
        client.on(Events.InteractionCreate, foreign);

        assert.ok(gateway.stop);
        await gateway.stop(lifecycleContext(context));

        assert.deepStrictEqual(client.listeners(Events.InteractionCreate), [foreign]);
        assert.strictEqual(client.listenerCount(Events.MessageCreate), 0);
        assert.strictEqual(client.destroyed, true);
    });

    it("start removes its listeners when login fails", async (t) => {
        const login_error = new Error("Invalid token.");
        const client = new FakeClient();
        client.login_error = login_error;
        t.mock.method(REST.prototype, "put", () => Promise.resolve([]));
        const gateway = defineDiscordGateway({id: "discord", client: client as unknown as Client, uses: [], mounts});
        const {start} = gateway;

        assert.ok(start);
        await assert.rejects(async () => start(lifecycleContext({
            config: {application_id: "app-1"},
            secrets: {token: "token-1"},
            log: {debug() {}, info() {}, warn() {}, error() {}},
            call: () => Promise.reject(new Error("Unexpected call.")),
        })), login_error);

        assert.strictEqual(client.listenerCount(Events.InteractionCreate), 0);
        assert.strictEqual(client.listenerCount(Events.MessageCreate), 0);
    });
});
