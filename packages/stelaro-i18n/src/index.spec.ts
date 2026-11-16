import {deepEqual, equal, match, ok, rejects} from "node:assert/strict";
import {test} from "node:test";

import {assertEqualType} from "@jiminp/tooltool";

import type {BoundI18n, I18n, Logger, MessageDescriptor, MessageValues, OptionalIfVoid} from "./index.ts";
import {catalogKey, createI18n, defineMessages} from "./index.ts";

const messages = defineMessages({
    greeting: {id: "greeting", defaultMessage: "Hello, {name}!", description: "Greeting to a signed-in user"},
    welcome: {defaultMessage: "Welcome", description: "Heading on the home page"},
    seed_only: {id: "seed-only", defaultMessage: "Seed only"},
    missing: {id: "missing", defaultMessage: "Source only"},
});

test("preserves descriptor literals and derives keys without using translator descriptions", () => {
    const descriptors = {greeting: messages.greeting};
    equal(defineMessages(descriptors), descriptors);
    assertEqualType<typeof messages.greeting, {
        readonly id: "greeting";
        readonly defaultMessage: "Hello, {name}!";
        readonly description: "Greeting to a signed-in user";
    }>();
    equal(catalogKey(messages.greeting), "greeting");
    equal(catalogKey(messages.welcome), "Welcome");
    equal(catalogKey({id: "", defaultMessage: "Source"}), "");
});

test("defaults to loading the source locale under i18n and treats absent catalogs as empty", async (t) => {
    const i18n = createI18n({default_locale: "en-GB", messages: {"en-GB": {Welcome: "Welcome aboard"}}});
    assertEqualType<typeof i18n, I18n>();
    equal(i18n.t("en-GB", messages.welcome), "Welcome aboard");
    equal(i18n.t("fr", messages.greeting, {name: "Ada"}), "Hello, Ada!");

    const readNull = t.mock.fn((_path: string) => Promise.resolve(null));
    const readAbsent = t.mock.fn((_path: string) => Promise.resolve());
    await i18n.load(readNull);
    await i18n.load(readAbsent);
    deepEqual(readNull.mock.calls.map(({arguments: args}) => args), [["i18n/en-GB.json"]]);
    deepEqual(readAbsent.mock.calls.map(({arguments: args}) => args), [["i18n/en-GB.json"]]);
    equal(i18n.t("en-GB", messages.welcome), "Welcome aboard");
    equal(i18n.t("fr", messages.welcome), "Welcome");
    await i18n.load(async () => ({Welcome: "Welcome back"}));
    equal(i18n.t("en-GB", messages.welcome), "Welcome back");
    equal(i18n.t("fr", messages.welcome), "Welcome");
});

test("overlays loaded IDs and keeps seed-only IDs and locales outside the load list", async () => {
    const paths: string[] = [];
    const french = Promise.withResolvers<unknown>();
    const i18n = createI18n({
        default_locale: "en",
        locales: ["fr", "es"],
        catalog_dir: "translations/ui",
        messages: {
            fr: {"greeting": "Salut, {name} !", "seed-only": "Amorce"},
            es: {Welcome: "Bienvenida"},
            de: {greeting: "Hallo, {name}!"},
        },
    });
    const bound = i18n.bind("fr");
    const loading = i18n.load(async (path) => {
        paths.push(path);
        return path.endsWith("/fr.json") ? french.promise : null;
    });
    deepEqual(paths, ["translations/ui/fr.json", "translations/ui/es.json"]);
    equal(bound.t(messages.greeting, {name: "Ada"}), "Salut, Ada !");
    french.resolve({greeting: "Bonjour, {name} !", Welcome: "Bienvenue"});
    await loading;

    equal(bound.t(messages.greeting, {name: "Ada"}), "Bonjour, Ada !");
    equal(bound.t(messages.welcome), "Bienvenue");
    equal(bound.t(messages.seed_only), "Amorce");
    equal(i18n.t("es", messages.welcome), "Bienvenida");
    equal(i18n.t("de", messages.greeting, {name: "Ada"}), "Hallo, Ada!");
});

test("a failed catalog load leaves prior translations available and can be retried", async () => {
    const i18n = createI18n({default_locale: "en", locales: ["en", "fr"], messages: {en: {Welcome: "Welcome aboard"}}});
    await rejects(i18n.load(async (path) => path.endsWith("/fr.json")
        ? {Welcome: [{type: 0, value: "Bienvenue"}]}
        : {Welcome: "New translation"}), {name: "TypeError", message: /i18n\/fr\.json/});
    equal(i18n.t("en", messages.welcome), "Welcome aboard");
    const failure = new Error("Read failed");
    await rejects(i18n.load(() => Promise.reject(failure)), failure);

    await i18n.load(async (path) => path.endsWith("/fr.json") ? {Welcome: "Bienvenue"} : null);
    equal(i18n.t("fr", messages.welcome), "Bienvenue");
});

test("formats ICU messages for concurrent locales and formats source fallback in the source locale", async () => {
    const descriptor = {id: "summary", defaultMessage: "{amount, number} on {day, date, long}"};
    const plural = {id: "count", defaultMessage: "{count, plural, one {# item} other {# items}}"};
    const select = {defaultMessage: "{tone, select, formal {Good day, {name}} other {Hello, {name}}}"};
    const date = new Date(2026, 0, 20, 12);
    const values = {amount: 1234.5, day: date};
    const i18n = createI18n({
        default_locale: "en-US",
        messages: {
            "fr": {
                summary: "{amount, number} le {day, date, long}",
                count: "{count, plural, one {# article} other {# articles}}",
            },
            "en-US": {missing: "Default locale catalog entry"},
        },
    });

    const french = i18n.bind("fr");
    const english = i18n.bind("en-US");
    const [first, second] = await Promise.all([
        Promise.resolve().then(() => [french.t(descriptor, values), french.t(plural, {count: 0})]),
        Promise.resolve().then(() => [english.t(descriptor, values), english.t(plural, {count: 0})]),
    ]);
    deepEqual(first, [
        `${new Intl.NumberFormat("fr").format(values.amount)} le ${new Intl.DateTimeFormat("fr", {dateStyle: "long"}).format(date)}`,
        "0 article",
    ]);
    deepEqual(second, [
        `${new Intl.NumberFormat("en-US").format(values.amount)} on ${new Intl.DateTimeFormat("en-US", {dateStyle: "long"}).format(date)}`,
        "0 items",
    ]);
    const unsupported = i18n.bind("es-MX");
    assertEqualType<typeof unsupported, BoundI18n<"es-MX">>();
    assertEqualType<typeof unsupported.locale, "es-MX">();
    equal(unsupported.locale, "es-MX");
    equal(unsupported.t(descriptor, values), second[0]);
    equal(unsupported.t(messages.missing), "Source only");
    equal(i18n.t("en-US", messages.missing), "Default locale catalog entry");
    equal(french.t(select, {tone: "formal", name: "Ada"}), "Good day, Ada");
    equal(french.t({defaultMessage: "'{literal}' and {name}"}, {name: "Ada"}), "{literal} and Ada");
});

test("reports ICU failures and continues through the source and key fallbacks", async (t) => {
    const i18n = createI18n({
        default_locale: "en",
        messages: {fr: {"greeting": "Bonjour, {", "Welcome": "Bienvenue, {name}", "broken": "{", "blank": "", "": "Empty key"}},
    });
    const console_error = t.mock.method(console, "error", () => {});
    equal(i18n.t("fr", messages.greeting, {name: "Ada"}), "Hello, Ada!");
    equal(console_error.mock.callCount(), 1);

    const report = t.mock.fn((_error: unknown) => {});
    const log: Logger = {debug() {}, info() {}, warn() {}, error: report};
    await i18n.load(() => Promise.resolve(null), log);
    equal(i18n.t("fr", messages.missing), "Source only");
    equal(i18n.t("fr", {id: "no-source", defaultMessage: ""}), "no-source");
    equal(i18n.t("fr", {id: "blank", defaultMessage: "Fallback"}), "");
    equal(i18n.t("fr", {id: "", defaultMessage: "Fallback"}), "Empty key");
    equal(report.mock.callCount(), 0);

    equal(i18n.t("fr", messages.greeting, {name: "Ada"}), "Hello, Ada!");
    equal(i18n.t("fr", messages.welcome), "Welcome");
    equal(i18n.t("fr", {id: "broken", defaultMessage: "Also broken {"}), "broken");
    equal(report.mock.callCount(), 4);
    ok(report.mock.calls.every(({arguments: [error]}) => error instanceof Error));
    match(String(report.mock.calls[1]?.arguments[0]), /name/);
    equal(console_error.mock.callCount(), 1);

    await i18n.load(() => Promise.resolve(null), {...log, error() { throw new Error("Logger failed"); }});
    equal(i18n.t("fr", messages.welcome), "Welcome");
    equal(i18n.t("fr", {id: "broken", defaultMessage: "Also broken {"}), "broken");
});

test("bound and unbound translators infer the same required values", () => {
    const i18n = createI18n({default_locale: "en"});
    const bound = i18n.bind("en");
    type GreetingValues = {name: string | number | bigint | boolean | null | Date};
    type GreetingArgs = [values: GreetingValues];
    assertEqualType<MessageValues<"Hello, {name}!">, GreetingValues>();
    assertEqualType<MessageValues<"{ name } '{literal}' {name}">, GreetingValues>();
    assertEqualType<MessageValues<"'{' and '}' or ''">, void>();
    assertEqualType<MessageValues<"It's {name}">, GreetingValues>();
    assertEqualType<MessageValues<"{now, time, short} {price, number}">, {now: number | Date; price: number | bigint}>();
    assertEqualType<MessageValues<"{count, plural, other {{name}}} {title}">, Record<string, unknown>>();
    assertEqualType<MessageValues<"{kind, selectordinal, other {#}}">, Record<string, unknown>>();
    assertEqualType<MessageValues<"{kind, select, other {{name}}}">, Record<string, unknown>>();
    assertEqualType<MessageValues<"Hi {name}" | "Now {now, date}" | "Plain">, GreetingValues & {now: number | Date}>();
    assertEqualType<MessageValues<MessageDescriptor["defaultMessage"]>, Record<string, unknown>>();
    assertEqualType<OptionalIfVoid<void>, [values?: void]>();
    assertEqualType<Parameters<typeof i18n.t<typeof messages.greeting>>, [locale: string, message: typeof messages.greeting, ...GreetingArgs]>();
    assertEqualType<Parameters<typeof bound.t<typeof messages.greeting>>, [message: typeof messages.greeting, ...GreetingArgs]>();
    assertEqualType<Parameters<typeof bound.t<typeof messages.welcome>>, [message: typeof messages.welcome, values?: void]>();

    function _checkInvalidValues(): void {
        // @ts-expect-error The unbound translator requires interpolation values.
        i18n.t("en", {defaultMessage: "Hi {name}"});
        // @ts-expect-error The bound translator requires interpolation values.
        bound.t(messages.greeting);
        // @ts-expect-error The extra key is absent from the source message.
        bound.t(messages.greeting, {name: "Ada", extra: true});
        // @ts-expect-error An ICU number argument requires a numeric value.
        bound.t({defaultMessage: "{amount, number}"}, {amount: "123"});
        // @ts-expect-error A literal without placeholders has no values argument.
        bound.t(messages.welcome, {});
    }

    equal(i18n.t("en", {defaultMessage: "Hi {name}"}, {name: "Ada"}), "Hi Ada");
    equal(bound.t(messages.welcome), "Welcome");
});
