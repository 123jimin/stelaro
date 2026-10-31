import assert from "node:assert/strict";
import {EventEmitter} from "node:events";
import {describe, it, type TestContext} from "node:test";
import {setImmediate} from "node:timers/promises";

import {defineComponentCalls, UserFacingError} from "@jiminp/stelaro";
import {ArkErrors, type as schema} from "arktype";
import {
    ApplicationCommandOptionType,
    ApplicationCommandType,
    type BaseInteraction,
    type Client,
    ContextMenuCommandBuilder,
    Events,
    MessageFlags,
    REST,
    Routes,
    SlashCommandBuilder,
} from "discord.js";

import {
    type ConcurrencyOptions,
    defineDiscordCommand,
    defineDiscordEvent,
    defineDiscordGateway,
    defineDiscordInteraction,
    defineDiscordMounts,
    type DiscordGatewayDefinition,
    type DiscordMountGroup,
    type Guard,
    perChannel,
    perGuild,
    perUser,
    type RateLimitOptions,
} from "./index.ts";

type Sent = {readonly method: "reply" | "followUp" | "respond"; readonly payload: unknown};
type InteractionKind = "chat_input" | "context_menu" | "autocomplete" | "button" | "select" | "modal";
type Listener = (...args: unknown[]) => unknown;
type Limits = {readonly rate_limit?: RateLimitOptions; readonly concurrency?: ConcurrencyOptions};

/** A discord.js client stand-in: a plain EventEmitter with stubbed `login` and `destroy`. */
class FakeClient extends EventEmitter {
    readonly logins: string[] = [];
    destroyed = false;
    /** Runs inside `login`; a throw fails the login. */
    onLogin: (() => void) | null = null;

    async login(token: string): Promise<string> {
        this.logins.push(token);
        this.onLogin?.();
        return token;
    }

    async destroy(): Promise<void> {
        await setImmediate();
        this.destroyed = true;
    }
}

const CounterCalls = defineComponentCalls("counter", {current: {input: schema({}), output: schema("number")}});

function lifecycleContext<T>(context: unknown): T {
    return context as T;
}

function mount(parts: Omit<DiscordMountGroup<readonly []>, "uses">) {
    return defineDiscordMounts({uses: [], ...parts});
}

/** Starts a gateway on a fake client with stubbed command registration, recording calls and error logs. */
async function startGateway(
    t: TestContext,
    definition: Partial<Pick<DiscordGatewayDefinition, "mounts" | "guards" | "uses">>,
    config: {readonly guild_id?: string} = {},
    fakes: {readonly client?: FakeClient; readonly register?: () => Promise<unknown>} = {},
) {
    const client = fakes.client ?? new FakeClient();
    const registrations: {readonly route: string; readonly body: unknown}[] = [];
    t.mock.method(REST.prototype, "put", (route: string, options?: {body?: unknown}) => {
        registrations.push({route, body: options?.body});
        return fakes.register?.() ?? Promise.resolve([]);
    });

    const gateway = defineDiscordGateway({id: "discord", client: client as unknown as Client, uses: [], ...definition});
    const errors: unknown[][] = [];
    const calls: {readonly reference: unknown; readonly input: unknown}[] = [];
    const context = {
        config: {application_id: "app-1", ...config},
        secrets: {token: "token-1"},
        log: {debug() {}, info() {}, warn() {}, error: (...args: unknown[]) => { errors.push(args); }},
        call: (reference: unknown, input: unknown) => {
            calls.push({reference, input});
            return Promise.resolve(7);
        },
    };

    assert.ok(gateway.start);
    await gateway.start(lifecycleContext(context));
    return {client, gateway, context, errors, calls, registrations};
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
        isStringSelectMenu: () => kind === "select",
        isModalSubmit: () => kind === "modal",
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

function componentInteraction(custom_id: string, kind: InteractionKind = "button", fields: Record<string, unknown> = {}) {
    return stubInteraction(kind, {customId: custom_id, ...fields});
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

function recordingGuard(order: string[], label: string, reject = false): Guard {
    return () => {
        order.push(label);
        if(reject) throw userFacingError();
    };
}

/** Asserts that exactly one message was sent, as an ephemeral `reply`; its wording is not specified. */
function assertEphemeralReply(sent: readonly Sent[]): void {
    assert.deepStrictEqual(sent.map(({method}) => method), ["reply"]);
    const {payload} = sent[0]!;
    assert.ok(typeof payload === "object" && payload != null && "flags" in payload);
    assert.strictEqual(payload.flags, MessageFlags.Ephemeral);
}

/** A `UserFacingError` whose internal cause should not reach the user (s0007). */
function userFacingError(): UserFacingError {
    return new UserFacingError("Nope", {cause: new Error("internal detail")});
}

/** The whole payload is pinned, so a reply carrying the error's cause fails the comparison. */
const EPHEMERAL_REPLY = {method: "reply", payload: {content: "Nope", flags: MessageFlags.Ephemeral}} as const;

describe("handler typing", () => {
    it("rejects inline handler calls outside the mount's `uses` at the type level, alongside helper-defined handlers", () => {
        const GreeterCalls = defineComponentCalls("greeter", {greet: {input: schema("string"), output: schema("string")}});

        defineDiscordMounts({
            uses: [CounterCalls],
            commands: [
                defineDiscordCommand({data: slashData("ping"), handle() {}}),
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

    it("types the interaction from the command builder and the options from the schema", () => {
        defineDiscordCommand({
            data: slashData("count"),
            options: schema({count: "number"}),
            handle({interaction, options}) {
                const count: number = options.count;
                void count;
                void interaction.options.getString("query");
                // @ts-expect-error -- a slash command interaction has no target
                void interaction.targetId;
                // @ts-expect-error -- the schema declares no `label`
                void options.label;
            },
        });
        defineDiscordCommand({
            data: new ContextMenuCommandBuilder().setName("Inspect").setType(ApplicationCommandType.User),
            handle({interaction}) {
                void interaction.targetId;
                // @ts-expect-error -- a context-menu interaction has no string options
                void interaction.options.getString("query");
            },
        });
    });

    it("types the event arguments as the client event's tuple", () => {
        defineDiscordEvent({
            type: Events.MessageUpdate,
            handle({event: [old_message, new_message]}) {
                const ids: string[] = [old_message.id, new_message.id];
                void ids;
            },
        });
        defineDiscordEvent({
            type: Events.MessageUpdate,
            handle({event}) {
                // @ts-expect-error -- `messageUpdate` has two arguments
                void event[2];
            },
        });
    });
});

describe("defineDiscordGateway", () => {
    it("attaches no listeners to the client before start", () => {
        const client = new FakeClient();

        defineDiscordGateway({
            id: "discord",
            client: client as unknown as Client,
            uses: [],
            mounts: [mount({
                commands: [defineDiscordCommand({data: slashData("ping"), handle() {}})],
                events: [defineDiscordEvent({type: Events.MessageCreate, handle() {}})],
                interactions: [defineDiscordInteraction({pattern: "vote:{id}", handle() {}})],
            })],
        });

        assert.deepStrictEqual(client.eventNames(), []);
    });

    it("requires application_id and accepts an optional string guild_id as configuration", () => {
        const {config} = defineDiscordGateway({id: "discord", client: new FakeClient() as unknown as Client, uses: []});

        assert.ok(config);
        assert.ok(!(config({application_id: "app-1"}) instanceof ArkErrors));
        assert.ok(!(config({application_id: "app-1", guild_id: "guild-1"}) instanceof ArkErrors));
        assert.ok(config({}) instanceof ArkErrors);
        assert.ok(config({application_id: "app-1", guild_id: 1}) instanceof ArkErrors);
    });

    it("merges gateway and mount uses, deduplicated by reference", () => {
        const GreeterCalls = defineComponentCalls("greeter", {greet: {input: schema("string"), output: schema("string")}});

        const {uses} = defineDiscordGateway({
            id: "discord",
            client: new FakeClient() as unknown as Client,
            uses: [CounterCalls],
            mounts: [
                defineDiscordMounts({uses: [CounterCalls, GreeterCalls]}),
                defineDiscordMounts({uses: [GreeterCalls]}),
            ],
        });

        assert.strictEqual(uses.length, 2);
        assert.ok(uses.includes(CounterCalls));
        assert.ok(uses.includes(GreeterCalls));
    });

    it("registers every mount's commands guild-scoped when guild_id is set, otherwise globally", async (t) => {
        const mounts = [
            mount({commands: [defineDiscordCommand({data: slashData("ping"), handle() {}})]}),
            mount({
                commands: [defineDiscordCommand({
                    data: new ContextMenuCommandBuilder().setName("Inspect").setType(ApplicationCommandType.User),
                    handle() {},
                })],
            }),
        ];

        const guild = await startGateway(t, {mounts}, {guild_id: "guild-9"});
        const global = await startGateway(t, {mounts});

        assert.deepStrictEqual(guild.registrations.map(({route}) => route), [Routes.applicationGuildCommands("app-1", "guild-9")]);
        assert.deepStrictEqual(global.registrations.map(({route}) => route), [Routes.applicationCommands("app-1")]);
        for(const {registrations} of [guild, global]) {
            const names = (registrations[0]!.body as {name: string}[]).map(({name}) => name);
            assert.deepStrictEqual(names.sort(), ["Inspect", "ping"]);
        }
    });

    it("throws RangeError for two commands of one type and name, within or across mounts", () => {
        const ping = () => defineDiscordCommand({data: slashData("ping"), handle() {}});
        const inspect = () => defineDiscordCommand({
            data: new ContextMenuCommandBuilder().setName("inspect").setType(ApplicationCommandType.User),
            handle() {},
        });

        for(const mounts of [
            [mount({commands: [ping(), ping()]})],
            [mount({commands: [ping()]}), mount({commands: [ping()]})],
            [mount({commands: [inspect()]}), mount({commands: [inspect()]})],
        ]) {
            assert.throws(() => defineDiscordGateway({id: "discord", client: new FakeClient() as unknown as Client, uses: [], mounts}), RangeError);
        }
    });

    it("registers commands of different types sharing a name and dispatches each interaction by its type", async (t) => {
        const handled: unknown[] = [];
        const {client, registrations} = await startGateway(t, {
            mounts: [
                mount({
                    commands: [
                        defineDiscordCommand({
                            data: new ContextMenuCommandBuilder().setName("search").setType(ApplicationCommandType.User),
                            handle({interaction}) { handled.push(["user", interaction]); },
                        }),
                        defineDiscordCommand({
                            data: new ContextMenuCommandBuilder().setName("search").setType(ApplicationCommandType.Message),
                            handle({interaction}) { handled.push(["message", interaction]); },
                        }),
                    ],
                }),
                mount({
                    commands: [defineDiscordCommand({
                        data: searchData(),
                        handle({interaction}) { handled.push(["chat_input", interaction]); },
                        autocomplete: {query: () => ["chat_input"]},
                    })],
                }),
            ],
        });
        const {interaction: message} = stubInteraction("context_menu", {commandName: "search", commandType: ApplicationCommandType.Message});
        const {interaction: user} = stubInteraction("context_menu", {commandName: "search", commandType: ApplicationCommandType.User});
        const {interaction: slash} = slashInteraction("search");
        const {interaction: typing, sent} = autocompleteInteraction("search", {name: "query", value: ""});

        for(const interaction of [message, user, slash, typing]) await emit(client, Events.InteractionCreate, interaction);

        assert.strictEqual((registrations[0]!.body as unknown[]).length, 3);
        assert.deepStrictEqual(handled, [["message", message], ["user", user], ["chat_input", slash]]);
        assert.deepStrictEqual(sent, [{method: "respond", payload: [{name: "chat_input", value: "chat_input"}]}]);
    });

    it("ignores a command interaction whose type and name match no command", async (t) => {
        const handled: unknown[] = [];
        const {client, errors} = await startGateway(t, {
            mounts: [mount({
                commands: [defineDiscordCommand({
                    data: new ContextMenuCommandBuilder().setName("inspect").setType(ApplicationCommandType.Message),
                    handle() { handled.push("message"); },
                })],
            })],
        });
        const user = stubInteraction("context_menu", {commandName: "inspect", commandType: ApplicationCommandType.User});
        const slash = slashInteraction("inspect");
        const typing = autocompleteInteraction("inspect", {name: "query", value: ""});
        const other = stubInteraction("context_menu", {commandName: "Inspect", commandType: ApplicationCommandType.Message});

        for(const {interaction} of [user, slash, typing, other]) await emit(client, Events.InteractionCreate, interaction);

        assert.deepStrictEqual(handled, []);
        assert.deepStrictEqual([user, slash, typing, other].flatMap(({sent}) => sent), []);
        assert.deepStrictEqual(errors, []);
    });
});

describe("handler context", () => {
    it("hands a command handler the raw interaction, the client, and a call bridged to the application", async (t) => {
        const received: unknown[] = [];
        const {client, calls} = await startGateway(t, {
            mounts: [defineDiscordMounts({
                uses: [CounterCalls],
                commands: [defineDiscordCommand({
                    data: slashData("count"),
                    async handle({interaction, client: handler_client, call}) {
                        received.push(interaction, handler_client, await call(CounterCalls.calls.current, {}));
                    },
                })],
            })],
        });
        const {interaction: count} = slashInteraction("count");

        await emit(client, Events.InteractionCreate, count);

        assert.strictEqual(received.length, 3);
        assert.strictEqual(received[0], count);
        assert.strictEqual(received[1], client);
        assert.strictEqual(received[2], 7);
        assert.deepStrictEqual(calls, [{reference: CounterCalls.calls.current, input: {}}]);
    });

    it("hands a persistent interaction handler the raw interaction, the client, and a bridged call", async (t) => {
        const received: unknown[] = [];
        const {client, calls} = await startGateway(t, {
            mounts: [defineDiscordMounts({
                uses: [CounterCalls],
                interactions: [defineDiscordInteraction({
                    pattern: "count",
                    async handle({interaction, client: handler_client, call}) {
                        received.push(interaction, handler_client, await call(CounterCalls.calls.current, {}));
                    },
                })],
            })],
        });
        const {interaction: button} = componentInteraction("count");

        await emit(client, Events.InteractionCreate, button);

        assert.strictEqual(received.length, 3);
        assert.strictEqual(received[0], button);
        assert.strictEqual(received[1], client);
        assert.strictEqual(received[2], 7);
        assert.deepStrictEqual(calls, [{reference: CounterCalls.calls.current, input: {}}]);
    });

    it("hands an event handler the raw argument tuple, the client, and a bridged call", async (t) => {
        const tuples: unknown[][] = [];
        const received: unknown[] = [];
        const {client, calls} = await startGateway(t, {
            mounts: [defineDiscordMounts({
                uses: [CounterCalls],
                events: [defineDiscordEvent({
                    type: Events.MessageUpdate,
                    async handle({event, client: handler_client, call}) {
                        tuples.push([...event]);
                        received.push(handler_client, await call(CounterCalls.calls.current, {}));
                    },
                })],
            })],
        });
        const old_message = {id: "message-1", content: "a"};
        const new_message = {id: "message-1", content: "b"};

        await emit(client, Events.MessageUpdate, old_message, new_message);

        assert.strictEqual(tuples.length, 1);
        assert.strictEqual(tuples[0]!.length, 2);
        assert.strictEqual(tuples[0]![0], old_message);
        assert.strictEqual(tuples[0]![1], new_message);
        assert.strictEqual(received[0], client);
        assert.strictEqual(received[1], 7);
        assert.deepStrictEqual(calls, [{reference: CounterCalls.calls.current, input: {}}]);
    });

    it("hands an autocomplete map handler the focused value, the interaction, and a bridged call", async (t) => {
        const received: unknown[] = [];
        const {client, calls} = await startGateway(t, {
            mounts: [defineDiscordMounts({
                uses: [CounterCalls],
                commands: [defineDiscordCommand({
                    data: searchData(),
                    handle() {},
                    autocomplete: {
                        async query({value, interaction, call}) {
                            received.push(value, interaction, await call(CounterCalls.calls.current, {}));
                            return [];
                        },
                    },
                })],
            })],
        });
        const {interaction: typing} = autocompleteInteraction("search", {name: "query", value: "ab"});

        await emit(client, Events.InteractionCreate, typing);

        assert.strictEqual(received.length, 3);
        assert.strictEqual(received[0], "ab");
        assert.strictEqual(received[1], typing);
        assert.strictEqual(received[2], 7);
        assert.deepStrictEqual(calls, [{reference: CounterCalls.calls.current, input: {}}]);
    });
});

describe("command options", () => {
    async function startCounting(t: TestContext, handled: unknown[]) {
        return startGateway(t, {
            mounts: [mount({
                commands: [defineDiscordCommand({
                    data: slashData("count")
                        .addStringOption((option) => option.setName("label").setDescription("Label"))
                        .addIntegerOption((option) => option.setName("count").setDescription("Count")),
                    options: schema({label: "string", count: "number"}).pipe(({label, count}) => ({text: `${label}:${count * 2}`})),
                    handle({options}) { handled.push(options); },
                })],
            })],
        });
    }

    it("validates the options with the schema and hands the handler its output", async (t) => {
        const handled: unknown[] = [];
        const {client} = await startCounting(t, handled);

        await emit(client, Events.InteractionCreate, slashInteraction("count", {
            options: {
                data: [
                    {name: "label", type: ApplicationCommandOptionType.String, value: "a"},
                    {name: "count", type: ApplicationCommandOptionType.Integer, value: 3},
                ],
            },
        }).interaction);

        assert.deepStrictEqual(handled, [{text: "a:6"}]);
    });

    it("skips the handler when the options fail validation", async (t) => {
        const handled: unknown[] = [];
        const {client} = await startCounting(t, handled);

        await emit(client, Events.InteractionCreate, slashInteraction("count", {
            options: {
                data: [
                    {name: "label", type: ApplicationCommandOptionType.String, value: "a"},
                    {name: "count", type: ApplicationCommandOptionType.String, value: "3"},
                ],
            },
        }).interaction);
        await emit(client, Events.InteractionCreate, slashInteraction("count", {
            options: {data: [{name: "label", type: ApplicationCommandOptionType.String, value: "a"}]},
        }).interaction);

        assert.deepStrictEqual(handled, []);
    });
});

describe("autocomplete", () => {
    it("keeps the first 25 choices and truncates names and values longer than 100 characters", async (t) => {
        const long = "abcdefghij".repeat(15);
        const exact = "x".repeat(100);
        const {client} = await startGateway(t, {
            mounts: [mount({
                commands: [defineDiscordCommand({
                    data: searchData(),
                    handle() {},
                    autocomplete: {
                        query: () => [
                            {name: long, value: long},
                            {name: exact, value: exact},
                            {name: long, value: "v"},
                            ...Array.from({length: 26}, (_, i) => ({name: `${i}`, value: `${i}`})),
                        ],
                    },
                })],
            })],
        });
        const {interaction: typing, sent} = autocompleteInteraction("search", {name: "query", value: ""});

        await emit(client, Events.InteractionCreate, typing);

        assert.deepStrictEqual(sent.map(({method}) => method), ["respond"]);
        const choices = sent[0]!.payload as {name: string; value: string}[];
        assert.strictEqual(choices.length, 25);
        assert.ok(choices[0]!.name.length > 0 && choices[0]!.name.length <= 100);
        assert.strictEqual(choices[0]!.value, long.slice(0, 100));
        assert.deepStrictEqual(choices[1], {name: exact, value: exact});
        assert.ok(choices[2]!.name.length > 0 && choices[2]!.name.length <= 100);
        assert.strictEqual(choices[2]!.value, "v");
        assert.deepStrictEqual(choices[3], {name: "0", value: "0"});
        assert.deepStrictEqual(choices[24], {name: "21", value: "21"});
    });

    it("normalizes string results to choices whose name and value are the string", async (t) => {
        const long = "abcdefghij".repeat(15);
        const {client} = await startGateway(t, {
            mounts: [mount({
                commands: [defineDiscordCommand({data: searchData(), handle() {}, autocomplete: {query: () => ["a", "b", long]}})],
            })],
        });
        const {interaction: typing, sent} = autocompleteInteraction("search", {name: "query", value: ""});

        await emit(client, Events.InteractionCreate, typing);

        assert.deepStrictEqual(sent.map(({method}) => method), ["respond"]);
        const choices = sent[0]!.payload as {name: string; value: string}[];
        assert.deepStrictEqual(choices.slice(0, 2), [{name: "a", value: "a"}, {name: "b", value: "b"}]);
        assert.strictEqual(choices.length, 3);
        assert.ok(choices[2]!.name.length > 0 && choices[2]!.name.length <= 100);
        assert.strictEqual(choices[2]!.value, long.slice(0, 100));
    });

    it("answers a subcommand option from the handler keyed by its `subcommand/option` path", async (t) => {
        const {client} = await startGateway(t, {
            mounts: [mount({
                commands: [defineDiscordCommand({
                    data: slashData("quote")
                        .addSubcommand((sub) => sub
                            .setName("search")
                            .setDescription("Search")
                            .addStringOption((option) => option.setName("query").setDescription("Query").setAutocomplete(true)))
                        .addSubcommand((sub) => sub
                            .setName("delete")
                            .setDescription("Delete")
                            .addStringOption((option) => option.setName("query").setDescription("Query").setAutocomplete(true))),
                    handle() {},
                    autocomplete: {
                        "search/query": ({value}) => [`search ${value}`],
                        "delete/query": ({value}) => [`delete ${value}`],
                    },
                })],
            })],
        });
        const search = autocompleteInteraction("quote", {name: "query", value: "a"}, "search");
        const remove = autocompleteInteraction("quote", {name: "query", value: "b"}, "delete");

        await emit(client, Events.InteractionCreate, search.interaction);
        await emit(client, Events.InteractionCreate, remove.interaction);

        assert.deepStrictEqual(search.sent, [{method: "respond", payload: [{name: "search a", value: "search a"}]}]);
        assert.deepStrictEqual(remove.sent, [{method: "respond", payload: [{name: "delete b", value: "delete b"}]}]);
    });

    it("hands a single autocomplete handler the interaction and a bridged call, and leaves the response to it", async (t) => {
        const received: unknown[] = [];
        const {client, calls} = await startGateway(t, {
            mounts: [defineDiscordMounts({
                uses: [CounterCalls],
                commands: [defineDiscordCommand({
                    data: searchData(),
                    handle() {},
                    autocomplete: async ({interaction: typing, call}) => {
                        received.push(typing, await call(CounterCalls.calls.current, {}));
                    },
                })],
            })],
        });
        const {interaction: typing, sent} = autocompleteInteraction("search", {name: "query", value: "a"});

        await emit(client, Events.InteractionCreate, typing);

        assert.strictEqual(received.length, 2);
        assert.strictEqual(received[0], typing);
        assert.strictEqual(received[1], 7);
        assert.deepStrictEqual(calls, [{reference: CounterCalls.calls.current, input: {}}]);
        assert.deepStrictEqual(sent, []);
    });
});

describe("events", () => {
    it("runs the handlers of one event concurrently", async (t) => {
        const order: string[] = [];
        const {client} = await startGateway(t, {
            mounts: [mount({
                events: [
                    defineDiscordEvent({
                        type: Events.MessageCreate,
                        async handle() {
                            order.push("first start");
                            await setImmediate();
                            order.push("first end");
                        },
                    }),
                    defineDiscordEvent({type: Events.MessageCreate, handle() { order.push("second start"); }}),
                ],
            })],
        });

        await emit(client, Events.MessageCreate, {id: "message-1"});

        assert.deepStrictEqual(order, ["first start", "second start", "first end"]);
    });

    it("runs every handler even when a sibling throws, and logs the rejection after all siblings finish", async (t) => {
        const error = new Error("Boom.");
        const received: unknown[] = [];
        const errors_seen_by_sibling: number[] = [];
        const {client, errors} = await startGateway(t, {
            mounts: [
                mount({events: [defineDiscordEvent({type: Events.MessageCreate, handle() { throw error; }})]}),
                mount({
                    events: [defineDiscordEvent({
                        type: Events.MessageCreate,
                        async handle({event: args}) {
                            await setImmediate();
                            received.push(args);
                            errors_seen_by_sibling.push(errors.length);
                        },
                    })],
                }),
            ],
        });
        const message = {id: "message-1"};

        await emit(client, Events.MessageCreate, message);

        assert.deepStrictEqual(received, [[message]]);
        assert.deepStrictEqual(errors_seen_by_sibling, [0]);
        assert.ok(errors.some((args) => args.includes(error)));
    });

    it("fetches partial arguments before the handler when fetch_partials is set", async (t) => {
        const received: unknown[][] = [];
        const full_message = {id: "message-1", partial: false, fetch: () => Promise.reject(new Error("Not partial."))};
        const fetched_reaction = {id: "reaction-1", partial: false};
        const partial_reaction = {id: "reaction-1", partial: true, fetch: () => Promise.resolve(fetched_reaction)};
        const user = {id: "user-1"};
        const {client, errors} = await startGateway(t, {
            mounts: [mount({
                events: [
                    defineDiscordEvent({
                        type: Events.MessageReactionAdd,
                        fetch_partials: true,
                        handle({event}) { received.push([...event]); },
                    }),
                    defineDiscordEvent({
                        type: Events.MessageUpdate,
                        fetch_partials: true,
                        handle({event}) { received.push([...event]); },
                    }),
                ],
            })],
        });

        await emit(client, Events.MessageReactionAdd, partial_reaction, user);
        await emit(client, Events.MessageUpdate, full_message, full_message);

        assert.deepStrictEqual(errors, []);
        assert.strictEqual(received.length, 2);
        assert.strictEqual(received[0]![0], fetched_reaction);
        assert.strictEqual(received[0]![1], user);
        assert.strictEqual(received[1]![0], full_message);
        assert.strictEqual(received[1]![1], full_message);
    });

    it("passes partial arguments unfetched without fetch_partials", async (t) => {
        const received: unknown[] = [];
        let fetches = 0;
        const partial_reaction = {
            id: "reaction-1",
            partial: true,
            fetch: () => {
                fetches++;
                return Promise.resolve({});
            },
        };
        const {client} = await startGateway(t, {
            mounts: [mount({
                events: [defineDiscordEvent({type: Events.MessageReactionAdd, handle({event: [reaction]}) { received.push(reaction); }})],
            })],
        });

        await emit(client, Events.MessageReactionAdd, partial_reaction, {id: "user-1"});

        assert.strictEqual(received[0], partial_reaction);
        assert.strictEqual(fetches, 0);
    });
});

describe("persistent interactions", () => {
    async function startQuotes(t: TestContext, handled: unknown[]) {
        return startGateway(t, {
            mounts: [mount({
                interactions: [
                    defineDiscordInteraction({pattern: "quote:delete:{quote_id}", handle({params}) { handled.push(["delete", params]); }}),
                    defineDiscordInteraction({pattern: "quote:list:{user}:{page}", handle({params}) { handled.push(["list", params]); }}),
                ],
            })],
        });
    }

    it("routes a custom id to the matching pattern with its params", async (t) => {
        const handled: unknown[] = [];
        const {client} = await startQuotes(t, handled);

        await emit(client, Events.InteractionCreate, componentInteraction("quote:list:u-1:2").interaction);
        await emit(client, Events.InteractionCreate, componentInteraction("quote:delete:q-1").interaction);

        assert.deepStrictEqual(handled, [["list", {user: "u-1", page: "2"}], ["delete", {quote_id: "q-1"}]]);
    });

    for(const custom_id of ["quote:list:u-1", "quote:list:u-1:2:3", "quote:remove:q-1", "Quote:delete:q-1", "quote:delete", "quotes:delete:q-1"]) {
        it(`matches no pattern for the custom id "${custom_id}"`, async (t) => {
            const handled: unknown[] = [];
            const {client} = await startQuotes(t, handled);
            const {interaction, sent} = componentInteraction(custom_id);

            await emit(client, Events.InteractionCreate, interaction);

            assert.deepStrictEqual(handled, []);
            assert.deepStrictEqual(sent, []);
        });
    }

    it("routes buttons, select menus, and modal submits", async (t) => {
        const handled: unknown[] = [];
        const {client} = await startQuotes(t, handled);

        for(const kind of ["button", "select", "modal"] as const) {
            await emit(client, Events.InteractionCreate, componentInteraction(`quote:delete:${kind}`, kind).interaction);
        }

        assert.deepStrictEqual(handled, [
            ["delete", {quote_id: "button"}],
            ["delete", {quote_id: "select"}],
            ["delete", {quote_id: "modal"}],
        ]);
    });

    it("matches case-sensitive parameter names, empty literal segments, and names shadowing Object.prototype", async (t) => {
        const handled: unknown[] = [];
        const {client} = await startGateway(t, {
            mounts: [mount({
                interactions: [
                    defineDiscordInteraction({pattern: "{a}:{A}:{_1}::end", handle({params}) { handled.push(params); }}),
                    defineDiscordInteraction({pattern: "{__proto__}:{constructor}", handle({params}) { handled.push(params); }}),
                ],
            })],
        });

        await emit(client, Events.InteractionCreate, componentInteraction("x:y:z::end").interaction);
        await emit(client, Events.InteractionCreate, componentInteraction("p:c").interaction);

        assert.deepStrictEqual(handled[0], {a: "x", A: "y", _1: "z"});
        assert.deepStrictEqual(handled[1], {["__proto__"]: "p", constructor: "c"});
        assert.strictEqual(handled.length, 2);
    });

    it("hands a custom id matching overlapping patterns to the first in definition order, across mounts", async (t) => {
        const handled: unknown[] = [];
        const {client} = await startGateway(t, {
            mounts: [
                mount({
                    interactions: [
                        defineDiscordInteraction({pattern: "vote:{id}", handle({params}) { handled.push(["first", params]); }}),
                        defineDiscordInteraction({pattern: "vote:{option}", handle({params}) { handled.push(["second", params]); }}),
                    ],
                }),
                mount({interactions: [defineDiscordInteraction({pattern: "vote:x", handle({params}) { handled.push(["third", params]); }})]}),
            ],
        });

        await emit(client, Events.InteractionCreate, componentInteraction("vote:x").interaction);

        assert.deepStrictEqual(handled, [["first", {id: "x"}]]);
    });

    for(const pattern of ["vote:{id", "vote:id}", "vote:{}", "vote:{a-b}", "vote:{ id }", "vote:{é}", "vote:{id}x", "vote:x{id}", "vote:{{id}}", "{id}:vote:{id}"]) {
        it(`throws RangeError when the gateway is defined with the malformed pattern "${pattern}"`, () => {
            const mounts = [mount({interactions: [defineDiscordInteraction({pattern, handle() {}})]})];

            assert.throws(() => defineDiscordGateway({id: "discord", client: new FakeClient() as unknown as Client, uses: [], mounts}), RangeError);
        });
    }
});

describe("guards", () => {
    it("runs gateway, mount, then command guards before the command handler", async (t) => {
        const order: string[] = [];
        const {client} = await startGateway(t, {
            guards: [recordingGuard(order, "gateway")],
            mounts: [mount({
                guards: [recordingGuard(order, "mount")],
                commands: [defineDiscordCommand({
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
            mounts: [mount({
                guards: [recordingGuard(order, "mount", true)],
                commands: [defineDiscordCommand({
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

    it("guards persistent interactions in gateway, mount, then handler order with the interaction and client", async (t) => {
        const order: string[] = [];
        const contexts: unknown[] = [];
        const {client} = await startGateway(t, {
            guards: [recordingGuard(order, "gateway")],
            mounts: [mount({
                guards: [recordingGuard(order, "mount")],
                interactions: [defineDiscordInteraction({
                    pattern: "vote:{id}",
                    guards: [
                        ({interaction, client: guard_client}) => { contexts.push(interaction, guard_client); },
                        recordingGuard(order, "interaction", true),
                    ],
                    handle() { order.push("handler"); },
                })],
            })],
        });
        const {interaction: vote, sent} = componentInteraction("vote:1");

        await emit(client, Events.InteractionCreate, vote);

        assert.deepStrictEqual(order, ["gateway", "mount", "interaction"]);
        assert.strictEqual(contexts[0], vote);
        assert.strictEqual(contexts[1], client);
        assert.deepStrictEqual(sent, [EPHEMERAL_REPLY]);
    });

    it("guards autocomplete in gateway, mount, then command order", async (t) => {
        const order: string[] = [];
        const {client} = await startGateway(t, {
            guards: [recordingGuard(order, "gateway")],
            mounts: [mount({
                guards: [recordingGuard(order, "mount")],
                commands: [defineDiscordCommand({
                    data: searchData(),
                    guards: [recordingGuard(order, "command")],
                    handle() {},
                    autocomplete: {query: () => { order.push("autocomplete"); return ["a"]; }},
                })],
            })],
        });

        await emit(client, Events.InteractionCreate, autocompleteInteraction("search", {name: "query", value: "a"}).interaction);

        assert.deepStrictEqual(order, ["gateway", "mount", "command", "autocomplete"]);
    });

    it("answers an autocomplete guard rejection with empty choices, skipping the handler", async (t) => {
        const order: string[] = [];
        const {client} = await startGateway(t, {
            mounts: [mount({
                guards: [recordingGuard(order, "mount", true)],
                commands: [
                    defineDiscordCommand({
                        data: searchData(),
                        handle() {},
                        autocomplete: {query: () => { order.push("autocomplete"); return ["a"]; }},
                    }),
                    defineDiscordCommand({
                        data: slashData("find").addStringOption((option) => option.setName("query").setDescription("Query").setAutocomplete(true)),
                        handle() {},
                        autocomplete: () => { order.push("fallback"); },
                    }),
                ],
            })],
        });
        const map = autocompleteInteraction("search", {name: "query", value: "a"});
        const fallback = autocompleteInteraction("find", {name: "query", value: "a"});

        await emit(client, Events.InteractionCreate, map.interaction);
        await emit(client, Events.InteractionCreate, fallback.interaction);

        assert.deepStrictEqual(order, ["mount", "mount"]);
        assert.deepStrictEqual(map.sent, [{method: "respond", payload: []}]);
        assert.deepStrictEqual(fallback.sent, [{method: "respond", payload: []}]);
    });

    it("does not guard events", async (t) => {
        const order: string[] = [];
        const {client} = await startGateway(t, {
            guards: [recordingGuard(order, "gateway", true)],
            mounts: [mount({
                guards: [recordingGuard(order, "mount", true)],
                events: [defineDiscordEvent({type: Events.MessageCreate, handle() { order.push("event"); }})],
            })],
        });

        await emit(client, Events.MessageCreate, {id: "message-1"});

        assert.deepStrictEqual(order, ["event"]);
    });
});

describe("limits", () => {
    const kinds = [
        {
            label: "command",
            define: (limits: Limits, handle: () => void | Promise<void>) => mount({
                commands: [defineDiscordCommand({data: slashData("ping"), ...limits, handle})],
            }),
            create: (fields: Record<string, unknown> = {}) => slashInteraction("ping", fields),
        },
        {
            label: "persistent interaction",
            define: (limits: Limits, handle: () => void | Promise<void>) => mount({
                interactions: [defineDiscordInteraction({pattern: "ping", ...limits, handle})],
            }),
            create: (fields: Record<string, unknown> = {}) => componentInteraction("ping", "button", fields),
        },
    ];

    for(const {label, define, create} of kinds) {
        it(`rejects a ${label} over its rate limit with an ephemeral message, skipping the handler`, async (t) => {
            let handled = 0;
            const {client} = await startGateway(t, {mounts: [define({rate_limit: {limit: 1, window_ms: 60_000}}, () => { handled++; })]});
            const first = create();
            const second = create();

            await emit(client, Events.InteractionCreate, first.interaction);
            await emit(client, Events.InteractionCreate, second.interaction);

            assert.strictEqual(handled, 1);
            assert.deepStrictEqual(first.sent, []);
            assertEphemeralReply(second.sent);
        });

        it(`rate-limits a ${label} per user by default`, async (t) => {
            let handled = 0;
            const {client} = await startGateway(t, {mounts: [define({rate_limit: {limit: 1, window_ms: 60_000}}, () => { handled++; })]});
            const other_place = create({guildId: "guild-2", channelId: "channel-2"});
            const other_user = create({user: {id: "user-2"}});

            await emit(client, Events.InteractionCreate, create().interaction);
            await emit(client, Events.InteractionCreate, other_place.interaction);
            await emit(client, Events.InteractionCreate, other_user.interaction);

            assert.strictEqual(handled, 2);
            assertEphemeralReply(other_place.sent);
            assert.deepStrictEqual(other_user.sent, []);
        });

        it(`limits a ${label}'s concurrency per user by default`, async (t) => {
            const gate = Promise.withResolvers<void>();
            let started = 0;
            const {client} = await startGateway(t, {
                mounts: [define({concurrency: {max: 1}}, async () => {
                    started++;
                    await gate.promise;
                })],
            });

            const pending = [
                emit(client, Events.InteractionCreate, create().interaction),
                emit(client, Events.InteractionCreate, create({guildId: "guild-2", channelId: "channel-2"}).interaction),
            ];
            await setImmediate();
            assert.strictEqual(started, 1);

            pending.push(emit(client, Events.InteractionCreate, create({user: {id: "user-2"}}).interaction));
            await setImmediate();
            assert.strictEqual(started, 2);

            gate.resolve();
            await Promise.all(pending);
        });
    }

    it("uses a custom key for rate limits", async (t) => {
        let handled = 0;
        const {client} = await startGateway(t, {
            mounts: [mount({
                commands: [defineDiscordCommand({
                    data: slashData("ping"),
                    rate_limit: {limit: 1, window_ms: 60_000, key: perGuild},
                    handle() { handled++; },
                })],
            })],
        });
        const same_guild = slashInteraction("ping", {user: {id: "user-2"}});

        await emit(client, Events.InteractionCreate, slashInteraction("ping").interaction);
        await emit(client, Events.InteractionCreate, same_guild.interaction);
        await emit(client, Events.InteractionCreate, slashInteraction("ping", {guildId: "guild-2"}).interaction);

        assert.strictEqual(handled, 2);
        assertEphemeralReply(same_guild.sent);
    });

    it("uses a custom key for concurrency limits", async (t) => {
        const gate = Promise.withResolvers<void>();
        let started = 0;
        const {client} = await startGateway(t, {
            mounts: [mount({
                commands: [defineDiscordCommand({
                    data: slashData("ping"),
                    concurrency: {max: 1, key: perGuild},
                    async handle() {
                        started++;
                        await gate.promise;
                    },
                })],
            })],
        });

        const pending = [
            emit(client, Events.InteractionCreate, slashInteraction("ping").interaction),
            emit(client, Events.InteractionCreate, slashInteraction("ping", {user: {id: "user-2"}}).interaction),
        ];
        await setImmediate();
        assert.strictEqual(started, 1);

        gate.resolve();
        await Promise.all(pending);
    });

    it("keeps a separate rate limit for each definition", async (t) => {
        const handled: string[] = [];
        const {client} = await startGateway(t, {
            mounts: [mount({
                commands: [
                    defineDiscordCommand({data: slashData("ping"), rate_limit: {limit: 1, window_ms: 60_000}, handle() { handled.push("ping"); }}),
                    defineDiscordCommand({data: slashData("pong"), rate_limit: {limit: 1, window_ms: 60_000}, handle() { handled.push("pong"); }}),
                ],
            })],
        });

        await emit(client, Events.InteractionCreate, slashInteraction("ping").interaction);
        await emit(client, Events.InteractionCreate, slashInteraction("pong").interaction);

        assert.deepStrictEqual(handled, ["ping", "pong"]);
    });

    it("rate-limits autocomplete separately from its command and answers the rejection with empty choices", async (t) => {
        let handled = 0;
        const {client} = await startGateway(t, {
            mounts: [mount({
                commands: [defineDiscordCommand({
                    data: searchData(),
                    rate_limit: {limit: 2, window_ms: 60_000},
                    handle() { handled++; },
                    autocomplete: {query: () => ["a"]},
                })],
            })],
        });
        const answers: Sent[] = [];

        await emit(client, Events.InteractionCreate, slashInteraction("search").interaction);
        for(let i = 0; i < 3; i++) {
            const {interaction, sent} = autocompleteInteraction("search", {name: "query", value: "a"});
            await emit(client, Events.InteractionCreate, interaction);
            answers.push(...sent);
        }
        await emit(client, Events.InteractionCreate, slashInteraction("search").interaction);
        const over = slashInteraction("search");
        await emit(client, Events.InteractionCreate, over.interaction);

        assert.deepStrictEqual(answers, [
            {method: "respond", payload: [{name: "a", value: "a"}]},
            {method: "respond", payload: [{name: "a", value: "a"}]},
            {method: "respond", payload: []},
        ]);
        assert.strictEqual(handled, 2);
        assertEphemeralReply(over.sent);
    });

    it("does not limit autocomplete concurrency", async (t) => {
        const gate = Promise.withResolvers<void>();
        let started = 0;
        const {client} = await startGateway(t, {
            mounts: [mount({
                commands: [defineDiscordCommand({
                    data: searchData(),
                    concurrency: {max: 1},
                    async handle() { await gate.promise; },
                    autocomplete: {
                        async query() {
                            started++;
                            await gate.promise;
                            return ["a"];
                        },
                    },
                })],
            })],
        });

        const pending = [
            emit(client, Events.InteractionCreate, slashInteraction("search").interaction),
            emit(client, Events.InteractionCreate, autocompleteInteraction("search", {name: "query", value: "a"}).interaction),
            emit(client, Events.InteractionCreate, autocompleteInteraction("search", {name: "query", value: "a"}).interaction),
        ];
        await setImmediate();

        assert.strictEqual(started, 2);
        gate.resolve();
        await Promise.all(pending);
    });

    it("releases the concurrency slot when the handler throws", async (t) => {
        let calls = 0;
        const {client} = await startGateway(t, {
            mounts: [mount({
                commands: [defineDiscordCommand({
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
        const second = emit(client, Events.InteractionCreate, slashInteraction("ping").interaction);
        await setImmediate();

        assert.strictEqual(calls, 2);
        await second;
    });
});

describe("execution order", () => {
    it("checks the rate limit only after the guards pass", async (t) => {
        let reject = true;
        let handled = 0;
        const {client} = await startGateway(t, {
            mounts: [mount({
                commands: [defineDiscordCommand({
                    data: slashData("ping"),
                    guards: [() => { if(reject) throw new UserFacingError("Nope"); }],
                    rate_limit: {limit: 1, window_ms: 60_000},
                    handle() { handled++; },
                })],
            })],
        });

        await emit(client, Events.InteractionCreate, slashInteraction("ping").interaction);
        reject = false;
        await emit(client, Events.InteractionCreate, slashInteraction("ping").interaction);

        assert.strictEqual(handled, 1);
    });

    it("acquires no concurrency slot for a rate-limited call", async (t) => {
        let handled = 0;
        const {client} = await startGateway(t, {
            mounts: [mount({
                commands: [defineDiscordCommand({
                    data: slashData("ping"),
                    rate_limit: {limit: 1, window_ms: 60_000},
                    concurrency: {max: 1, key: perGuild},
                    handle() { handled++; },
                })],
            })],
        });

        await emit(client, Events.InteractionCreate, slashInteraction("ping").interaction);
        await emit(client, Events.InteractionCreate, slashInteraction("ping").interaction);
        const other_user = emit(client, Events.InteractionCreate, slashInteraction("ping", {user: {id: "user-2"}}).interaction);
        await setImmediate();

        assert.strictEqual(handled, 2);
        await other_user;
    });

    it("releases the concurrency slot before dispatching the handler's error", async (t) => {
        let calls = 0;
        const {client} = await startGateway(t, {
            mounts: [mount({
                commands: [defineDiscordCommand({
                    data: slashData("ping"),
                    concurrency: {max: 1},
                    handle() {
                        calls++;
                        if(calls === 1) throw new UserFacingError("Nope");
                    },
                })],
            })],
        });
        const stalled = slashInteraction("ping", {reply: () => new Promise(() => {})});

        void emit(client, Events.InteractionCreate, stalled.interaction);
        await setImmediate();
        const second = emit(client, Events.InteractionCreate, slashInteraction("ping").interaction);
        await setImmediate();

        assert.strictEqual(calls, 2);
        await second;
    });

    it("checks the autocomplete rate limit only after the guards pass", async (t) => {
        let reject = true;
        const {client} = await startGateway(t, {
            mounts: [mount({
                commands: [defineDiscordCommand({
                    data: searchData(),
                    guards: [() => { if(reject) throw new UserFacingError("Nope"); }],
                    rate_limit: {limit: 1, window_ms: 60_000},
                    handle() {},
                    autocomplete: {query: () => ["a"]},
                })],
            })],
        });
        const second = autocompleteInteraction("search", {name: "query", value: "a"});

        await emit(client, Events.InteractionCreate, autocompleteInteraction("search", {name: "query", value: "a"}).interaction);
        reject = false;
        await emit(client, Events.InteractionCreate, second.interaction);

        assert.deepStrictEqual(second.sent, [{method: "respond", payload: [{name: "a", value: "a"}]}]);
    });
});

describe("handler errors", () => {
    async function startThrowing(t: TestContext, error: unknown) {
        return startGateway(t, {
            mounts: [mount({commands: [defineDiscordCommand({data: slashData("ping"), handle() { throw error; }})]})],
        });
    }

    it("replies to a UserFacingError ephemerally when the interaction is fresh", async (t) => {
        const {client} = await startThrowing(t, userFacingError());
        const {interaction: ping, sent} = slashInteraction("ping");

        await emit(client, Events.InteractionCreate, ping);

        assert.deepStrictEqual(sent, [EPHEMERAL_REPLY]);
    });

    for(const state of [{deferred: true}, {replied: true}]) {
        it(`follows up on a UserFacingError when the interaction is ${Object.keys(state)[0]}`, async (t) => {
            const {client} = await startThrowing(t, userFacingError());
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

    it("replies to a persistent interaction handler's UserFacingError ephemerally", async (t) => {
        const {client} = await startGateway(t, {
            mounts: [mount({interactions: [defineDiscordInteraction({pattern: "vote", handle() { throw userFacingError(); }})]})],
        });
        const {interaction: vote, sent} = componentInteraction("vote");

        await emit(client, Events.InteractionCreate, vote);

        assert.deepStrictEqual(sent, [EPHEMERAL_REPLY]);
    });

    it("sends no ephemeral message for an autocomplete handler's UserFacingError", async (t) => {
        const {client} = await startGateway(t, {
            mounts: [mount({
                commands: [defineDiscordCommand({
                    data: searchData(),
                    handle() {},
                    autocomplete: {query: () => { throw new UserFacingError("Nope"); }},
                })],
            })],
        });
        const {interaction: typing, sent} = autocompleteInteraction("search", {name: "query", value: "a"});

        await emit(client, Events.InteractionCreate, typing);

        assert.deepStrictEqual(sent.filter(({method}) => method !== "respond"), []);
    });
});

describe("key extractors", () => {
    function keyed(fields: {readonly guildId: string | null; readonly channelId: string | null}) {
        return {user: {id: "user-1"}, ...fields} as unknown as BaseInteraction;
    }

    it("perUser returns the user id", () => {
        assert.strictEqual(perUser(keyed({guildId: "guild-1", channelId: "channel-1"})), "user-1");
    });

    it("perGuild returns the guild id, or dm outside a guild", () => {
        assert.strictEqual(perGuild(keyed({guildId: "guild-1", channelId: "channel-1"})), "guild-1");
        assert.strictEqual(perGuild(keyed({guildId: null, channelId: "channel-1"})), "dm");
    });

    it("perChannel returns the channel id, or unknown without a channel", () => {
        assert.strictEqual(perChannel(keyed({guildId: "guild-1", channelId: "channel-1"})), "channel-1");
        assert.strictEqual(perChannel(keyed({guildId: null, channelId: null})), "unknown");
    });
});

describe("lifecycle", () => {
    const mounts = [mount({
        commands: [defineDiscordCommand({data: slashData("ping"), handle() {}})],
        events: [defineDiscordEvent({type: Events.MessageCreate, handle() {}})],
    })];

    it("start registers commands, then logs the client in with the gateway's token, handling events and interactions emitted during login", async (t) => {
        const order: unknown[] = [];
        const client = new FakeClient();
        client.onLogin = () => {
            order.push("login");
            client.emit(Events.MessageCreate, "during-login");
            client.emit(Events.InteractionCreate, slashInteraction("ping").interaction);
        };
        await startGateway(t, {
            mounts: [mount({
                commands: [defineDiscordCommand({data: slashData("ping"), handle() { order.push("ping"); }})],
                events: [defineDiscordEvent({type: Events.MessageCreate, handle({event}) { order.push(event[0]); }})],
            })],
        }, {}, {
            client,
            register: () => {
                order.push("register");
                return Promise.resolve([]);
            },
        });
        await setImmediate();

        assert.deepStrictEqual(client.logins, ["token-1"]);
        assert.deepStrictEqual(order, ["register", "login", "during-login", "ping"]);
    });

    it("fails start with the registration error before attaching listeners or logging in", async (t) => {
        const error = new Error("Registration failed.");
        const client = new FakeClient();

        await assert.rejects(startGateway(t, {mounts}, {}, {client, register: () => Promise.reject(error)}), (thrown) => thrown === error);

        assert.deepStrictEqual(client.eventNames(), []);
        assert.deepStrictEqual(client.logins, []);
    });

    it("fails start with the login error after removing only its listeners, leaving commands registered", async (t) => {
        const error = new Error("Login failed.");
        const foreign = () => {};
        const client = new FakeClient();
        client.on(Events.InteractionCreate, foreign);
        client.onLogin = () => { throw error; };
        let registrations = 0;

        await assert.rejects(startGateway(t, {mounts}, {}, {
            client,
            register: () => {
                registrations++;
                return Promise.resolve([]);
            },
        }), (thrown) => thrown === error);

        assert.deepStrictEqual(client.listeners(Events.InteractionCreate), [foreign]);
        assert.strictEqual(client.listenerCount(Events.MessageCreate), 0);
        assert.strictEqual(registrations, 1);
    });

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
});
