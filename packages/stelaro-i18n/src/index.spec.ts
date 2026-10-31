import assert from "node:assert/strict";
import {describe, it, type TestContext} from "node:test";

import {catalogKey, type CatalogReader, createI18n, defineMessages, type Logger} from "./index.ts";

/** A CatalogReader stand-in serving catalogs from memory. */
function fakeReader(catalogs: Record<string, Record<string, string>>): CatalogReader {
    return (subpath: string) => Promise.resolve(catalogs[subpath] ?? null);
}

type SpyLogger = Logger & {readonly calls: unknown[][]};

/** A Logger stand-in recording the arguments of every call at any level. */
function spyLogger(): SpyLogger {
    const calls: unknown[][] = [];
    const record = (...args: unknown[]) => { calls.push(args); };
    return {calls, debug: record, info: record, warn: record, error: record};
}

/** Silences the console for one test; counts `console.error` calls and calls to any method. */
function spyConsole(t: TestContext): {error: () => number; any: () => number} {
    const error = t.mock.method(console, "error", () => {});
    const others = (["debug", "info", "log", "warn"] as const).map((name) => t.mock.method(console, name, () => {}));
    return {
        error: () => error.mock.callCount(),
        any: () => others.reduce((total, method) => total + method.mock.callCount(), error.mock.callCount()),
    };
}

describe("catalogKey", () => {
    it("is the explicit id when present", () => {
        assert.equal(catalogKey({id: "greeting", defaultMessage: "Hi"}), "greeting");
    });

    it("is the source text when the id is absent", () => {
        assert.equal(catalogKey({defaultMessage: "Hi {name}"}), "Hi {name}");
    });

    it("ignores the description", () => {
        assert.equal(catalogKey({defaultMessage: "Hi", description: "Greeting on the home page"}), "Hi");
        assert.equal(catalogKey({id: "greeting", defaultMessage: "Hi", description: "Greeting"}), "greeting");
    });
});

describe("defineMessages", () => {
    it("returns the descriptors it is given", () => {
        const descriptors = {greeting: {id: "greeting", defaultMessage: "Hi {name}", description: "Home page"}};
        assert.equal(defineMessages(descriptors), descriptors);
    });

    it("preserves the source text type for value inference", () => {
        const i18n = createI18n({default_locale: "en"});
        const messages = defineMessages({greeting: {defaultMessage: "Hi {name}"}});
        assert.equal(i18n.t("en", messages.greeting, {name: "World"}), "Hi World");

        // Type-level checks only; never invoked.
        const typeChecks = (): void => {
            // @ts-expect-error the inferred placeholder requires its value.
            i18n.t("en", messages.greeting);
        };
        void typeChecks;
    });
});

describe("createI18n", () => {
    describe("construction and loading", () => {
        it("translates from seeded catalogs without loading", () => {
            const i18n = createI18n({default_locale: "en", messages: {fr: {greeting: "Bonjour {name}"}}});
            assert.equal(i18n.t("fr", {id: "greeting", defaultMessage: "Hi {name}"}, {name: "World"}), "Bonjour World");
        });

        it("reads only the default locale under i18n by default", async () => {
            const i18n = createI18n({default_locale: "ko"});
            const requested: string[] = [];
            await i18n.load((subpath) => {
                requested.push(subpath);
                return Promise.resolve({greeting: "안녕"});
            });
            assert.deepEqual(requested, ["i18n/ko.json"]);
            assert.equal(i18n.t("ko", {id: "greeting", defaultMessage: "Hi"}), "안녕");
        });

        it("reads every configured locale and only those", async () => {
            const i18n = createI18n({default_locale: "en", locales: ["fr", "ko"]});
            const requested: string[] = [];
            await i18n.load((subpath) => {
                requested.push(subpath);
                return Promise.resolve(subpath === "i18n/fr.json" ? {greeting: "Bonjour"} : {greeting: "안녕"});
            });
            assert.deepEqual(requested.toSorted(), ["i18n/fr.json", "i18n/ko.json"]);
            assert.equal(i18n.t("fr", {id: "greeting", defaultMessage: "Hi"}), "Bonjour");
            assert.equal(i18n.t("ko", {id: "greeting", defaultMessage: "Hi"}), "안녕");
        });

        it("reads catalogs under a custom catalog_dir", async () => {
            const i18n = createI18n({default_locale: "en", locales: ["fr"], catalog_dir: "lang"});
            const requested: string[] = [];
            await i18n.load((subpath) => {
                requested.push(subpath);
                return Promise.resolve({greeting: "Salut"});
            });
            assert.deepEqual(requested, ["lang/fr.json"]);
            assert.equal(i18n.t("fr", {id: "greeting", defaultMessage: "Hi"}), "Salut");
        });

        it("treats a null reader result as an empty catalog", async () => {
            const i18n = createI18n({default_locale: "en", locales: ["fr"]});
            await i18n.load(fakeReader({}));
            assert.equal(i18n.t("fr", {id: "greeting", defaultMessage: "Hi {name}"}, {name: "World"}), "Hi World");
        });

        it("treats an undefined reader result as an empty catalog", async () => {
            const i18n = createI18n({default_locale: "en", locales: ["fr"], messages: {fr: {greeting: "Bonjour"}}});
            await i18n.load(() => Promise.resolve());
            assert.equal(i18n.t("fr", {id: "greeting", defaultMessage: "Hi"}), "Bonjour");
            assert.equal(i18n.t("fr", {id: "farewell", defaultMessage: "Bye"}), "Bye");
        });

        it("overlays loaded ids on the seed for the same locale", async () => {
            const i18n = createI18n({
                default_locale: "en",
                locales: ["fr"],
                messages: {fr: {greeting: "Bonjour", farewell: "Au revoir"}},
            });
            await i18n.load(fakeReader({"i18n/fr.json": {greeting: "Salut", thanks: "Merci"}}));
            assert.equal(i18n.t("fr", {id: "greeting", defaultMessage: "Hi"}), "Salut");
            assert.equal(i18n.t("fr", {id: "farewell", defaultMessage: "Bye"}), "Au revoir");
            assert.equal(i18n.t("fr", {id: "thanks", defaultMessage: "Thanks"}), "Merci");
        });

        it("keeps seeded locales that are not listed in locales", async () => {
            const i18n = createI18n({default_locale: "en", locales: ["de"], messages: {fr: {greeting: "Bonjour"}}});
            const requested: string[] = [];
            assert.equal(i18n.t("fr", {id: "greeting", defaultMessage: "Hi"}), "Bonjour");
            await i18n.load((subpath) => {
                requested.push(subpath);
                return Promise.resolve({greeting: "Hallo"});
            });
            assert.deepEqual(requested, ["i18n/de.json"]);
            assert.equal(i18n.t("fr", {id: "greeting", defaultMessage: "Hi"}), "Bonjour");
            assert.equal(i18n.t("de", {id: "greeting", defaultMessage: "Hi"}), "Hallo");
        });

        it("returns source text while a load is pending", async () => {
            const i18n = createI18n({default_locale: "en", locales: ["fr"]});
            const {promise, resolve} = Promise.withResolvers<unknown>();
            const loading = i18n.load(() => promise);
            assert.equal(i18n.t("fr", {id: "greeting", defaultMessage: "Hi"}), "Hi");
            resolve({greeting: "Salut"});
            await loading;
            assert.equal(i18n.t("fr", {id: "greeting", defaultMessage: "Hi"}), "Salut");
        });
    });

    describe("translation", () => {
        it("returns source text before any catalog is loaded", () => {
            const i18n = createI18n({default_locale: "en"});
            assert.equal(i18n.t("en", {id: "greeting", defaultMessage: "Hello"}), "Hello");
            assert.equal(i18n.t("fr", {id: "greeting", defaultMessage: "Hi {name}"}, {name: "World"}), "Hi World");
        });

        it("falls back to source text for an id absent from the locale's catalog", async () => {
            const i18n = createI18n({default_locale: "en", locales: ["fr"], messages: {fr: {other: "Autre"}}});
            assert.equal(i18n.t("fr", {id: "greeting", defaultMessage: "Hi {name}"}, {name: "World"}), "Hi World");
            await i18n.load(fakeReader({"i18n/fr.json": {other: "Autre"}}));
            assert.equal(i18n.t("fr", {id: "greeting", defaultMessage: "Hi {name}"}, {name: "World"}), "Hi World");
        });

        it("falls back to source text for a locale without a catalog", async () => {
            const i18n = createI18n({default_locale: "en", locales: ["fr"]});
            await i18n.load(fakeReader({"i18n/fr.json": {greeting: "Bonjour {name}"}}));
            assert.equal(i18n.t("de", {id: "greeting", defaultMessage: "Hi {name}"}, {name: "World"}), "Hi World");
        });

        it("formats the fallback for a locale without a catalog in default_locale", () => {
            const i18n = createI18n({default_locale: "de", messages: {en: {amount: "{n, number} EUR"}}});
            const message = {id: "amount", defaultMessage: "{n, number} Euro"} as const;
            assert.equal(i18n.t("fr", message, {n: 1234.5}), "1.234,5 Euro");
            assert.equal(i18n.t("en", message, {n: 1234.5}), "1,234.5 EUR");
        });

        it("matches catalog locales case-insensitively", async () => {
            const i18n = createI18n({default_locale: "en", locales: ["zh-hant-tw"], messages: {"ko-KR": {Hi: "안녕"}}});
            await i18n.load(fakeReader({"i18n/zh-hant-tw.json": {Hi: "你好"}}));
            for(const locale of ["ko-KR", "ko-kr", "KO-KR", "Ko-kR"]) assert.equal(i18n.t(locale, {defaultMessage: "Hi"}), "안녕", locale);
            for(const locale of ["zh-Hant-TW", "ZH-HANT-TW"]) assert.equal(i18n.t(locale, {defaultMessage: "Hi"}), "你好", locale);
            assert.equal(i18n.t("ko", {defaultMessage: "Hi"}), "Hi");
        });

        it("merges seeded and loaded catalogs whose locales differ only in case", async () => {
            const i18n = createI18n({default_locale: "en", locales: ["fr-ca"], messages: {"fr-CA": {Hi: "Salut", Bye: "Bye-seed"}}});
            await i18n.load(fakeReader({"i18n/fr-ca.json": {Bye: "Au revoir"}}));
            assert.deepEqual(["Hi", "Bye"].map((text) => i18n.t("fr-CA", {defaultMessage: text})), ["Salut", "Au revoir"]);
        });

        it("falls back to the literal key when defaultMessage is empty", () => {
            const i18n = createI18n({default_locale: "en"});
            assert.equal(i18n.t("fr", {id: "greeting", defaultMessage: ""}), "greeting");
        });

        it("falls back to source text for ids named like Object.prototype members", () => {
            const i18n = createI18n({default_locale: "en", messages: {fr: {}}});
            for(const id of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
                assert.equal(i18n.t("fr", {id, defaultMessage: "Hi"}), "Hi");
            }
        });

        it("translates an id parsed from JSON as __proto__", async () => {
            const i18n = createI18n({default_locale: "en", locales: ["fr"]});
            await i18n.load(() => Promise.resolve(JSON.parse(`{"__proto__": "Salut"}`)));
            assert.equal(i18n.t("fr", {id: "__proto__", defaultMessage: "Hi"}), "Salut");
        });

        it("translates a catalog for a well-formed locale without platform data", async () => {
            const i18n = createI18n({default_locale: "de", locales: ["xx"]});
            await i18n.load(fakeReader({"i18n/xx.json": {count: "xx items"}}));
            assert.equal(i18n.t("xx", {id: "count", defaultMessage: "items"}), "xx items");
        });

        it("keys an id-less descriptor by its source text", () => {
            const i18n = createI18n({default_locale: "en", messages: {fr: {"Hi {name}": "Bonjour {name}"}}});
            assert.equal(i18n.t("fr", {defaultMessage: "Hi {name}"}, {name: "World"}), "Bonjour World");
            assert.equal(i18n.t("fr", {defaultMessage: "Bye {name}"}, {name: "World"}), "Bye World");
        });

        it("prefers an explicit id over the source-text key", () => {
            const i18n = createI18n({default_locale: "en", messages: {fr: {greeting: "Par id", Hi: "Par texte"}}});
            assert.equal(i18n.t("fr", {id: "greeting", defaultMessage: "Hi"}), "Par id");
            assert.equal(i18n.t("fr", {id: "absent", defaultMessage: "Hi"}), "Hi");
        });

        it("ignores the description when looking up a translation", () => {
            const i18n = createI18n({default_locale: "en", messages: {fr: {Hi: "Salut", greeting: "Bonjour"}}});
            assert.equal(i18n.t("fr", {defaultMessage: "Hi", description: "Home page greeting"}), "Salut");
            assert.equal(i18n.t("fr", {id: "greeting", defaultMessage: "Hi", description: "Greeting"}), "Bonjour");
        });

        it("keeps interleaved locales independent", async () => {
            const i18n = createI18n({default_locale: "en", locales: ["fr", "ko"]});
            await i18n.load(fakeReader({
                "i18n/fr.json": {greeting: "Bonjour {name}"},
                "i18n/ko.json": {greeting: "안녕 {name}"},
            }));
            const message = {id: "greeting", defaultMessage: "Hi {name}"} as const;
            const results = ["fr", "ko", "en", "fr", "de", "ko"].map((locale) => i18n.t(locale, message, {name: "A"}));
            assert.deepEqual(results, ["Bonjour A", "안녕 A", "Hi A", "Bonjour A", "Hi A", "안녕 A"]);
        });

        it("formats numbers with the requested locale's rules", () => {
            const i18n = createI18n({default_locale: "en", messages: {de: {amount: "{n, number}"}, en: {amount: "{n, number}"}}});
            const message = {id: "amount", defaultMessage: "{n, number}"} as const;
            assert.equal(i18n.t("de", message, {n: 1234.5}), "1.234,5");
            assert.equal(i18n.t("en", message, {n: 1234.5}), "1,234.5");
        });

        it("selects plural categories with the requested locale's rules", () => {
            const i18n = createI18n({
                default_locale: "en",
                messages: {fr: {items: "{count, plural, one {un} other {plusieurs}}"}},
            });
            const message = {id: "items", defaultMessage: "{count, plural, one {# item} other {# items}}"} as const;
            assert.equal(i18n.t("en", message, {count: 0}), "0 items");
            assert.equal(i18n.t("en", message, {count: 1}), "1 item");
            assert.equal(i18n.t("en", message, {count: 2}), "2 items");
            assert.equal(i18n.t("fr", message, {count: 0}), "un");
            assert.equal(i18n.t("fr", message, {count: 2}), "plusieurs");
        });

        it("formats ICU select from the source", () => {
            const i18n = createI18n({default_locale: "en"});
            const message = {defaultMessage: "{role, select, admin {Admin} other {Guest}}"} as const;
            assert.equal(i18n.t("en", message, {role: "admin"}), "Admin");
            assert.equal(i18n.t("en", message, {role: "anyone"}), "Guest");
        });

        it("types interpolation values from the source text", () => {
            const i18n = createI18n({default_locale: "en"});
            const fr = i18n.bind("fr");
            // Type-level checks only; never invoked.
            const typeChecks = (): void => {
                // @ts-expect-error a simple placeholder requires its value.
                i18n.t("en", {defaultMessage: "Hi {name}"});
                // @ts-expect-error placeholder names must match the source.
                i18n.t("en", {defaultMessage: "Hi {name}"}, {nme: "x"});
                // @ts-expect-error simple placeholders reject extra names.
                i18n.t("en", {defaultMessage: "Hi {name}"}, {name: "x", extra: "y"});
                // @ts-expect-error a placeholder-free message takes no values.
                i18n.t("en", {defaultMessage: "Hi"}, {name: "x"});
                // @ts-expect-error plural syntax requires values.
                i18n.t("en", {defaultMessage: "{count, plural, one {# item} other {# items}}"});
                // @ts-expect-error bind requires simple placeholder values.
                fr.t({defaultMessage: "Hi {name}"});
                // @ts-expect-error bind rejects extra simple placeholder names.
                fr.t({defaultMessage: "Hi {name}"}, {name: "x", extra: "y"});
                // @ts-expect-error bind rejects values for a placeholder-free message.
                fr.t({defaultMessage: "Hi"}, {name: "x"});
                i18n.t("en", {defaultMessage: "Hi"});
                fr.t({defaultMessage: "Hi"});
                i18n.t("en", {defaultMessage: "Hi {a} and {b}"}, {a: 1, b: "two"});
                i18n.t("en", {defaultMessage: "{count, plural, one {# item} other {# items}}"}, {count: 1, extra: "y"});
                fr.t({defaultMessage: "{role, select, admin {A} other {B}}"}, {role: "admin"});
            };
            void typeChecks;
        });
    });

    describe("error reporting", () => {
        it("reports malformed ICU in a translation through the load logger and falls back to source", async (t) => {
            const console_spy = spyConsole(t);
            const i18n = createI18n({default_locale: "en", locales: ["fr"]});
            const log = spyLogger();
            await i18n.load(fakeReader({"i18n/fr.json": {count: "{n, plural, one {un}"}}), log);
            assert.equal(i18n.t("fr", {id: "count", defaultMessage: "Count {n}"}, {n: 1}), "Count 1");
            assert.ok(log.calls.length > 0);
            assert.equal(console_spy.any(), 0);
        });

        it("reports a missing interpolation value through the load logger without throwing", async (t) => {
            const console_spy = spyConsole(t);
            const i18n = createI18n({default_locale: "en", locales: ["fr"]});
            const log = spyLogger();
            // The source has no placeholder, so the call type-checks without values.
            await i18n.load(fakeReader({"i18n/fr.json": {greeting: "Bonjour {name}"}}), log);
            assert.equal(i18n.t("fr", {id: "greeting", defaultMessage: "Hello"}), "Hello");
            assert.ok(log.calls.length > 0);
            assert.equal(console_spy.any(), 0);
        });

        it("reports a missing plural value through the load logger without throwing", async (t) => {
            spyConsole(t);
            const i18n = createI18n({default_locale: "en"});
            const log = spyLogger();
            await i18n.load(fakeReader({}), log);
            assert.equal(typeof i18n.t("en", {defaultMessage: "{count, plural, one {# item} other {# items}}"}, {}), "string");
            assert.ok(log.calls.length > 0);
        });

        it("reports malformed ICU source through console.error without a logger", (t) => {
            const console_spy = spyConsole(t);
            const i18n = createI18n({default_locale: "en"});
            const source = "{count, plural, one {# item}";
            assert.equal(i18n.t("en", {defaultMessage: source}, {count: 1}), source);
            assert.ok(console_spy.error() > 0);
        });

        it("reports a missing value through console.error when load received no logger", async (t) => {
            const console_spy = spyConsole(t);
            const i18n = createI18n({default_locale: "en", locales: ["fr"]});
            await i18n.load(fakeReader({"i18n/fr.json": {greeting: "Bonjour {name}"}}));
            assert.equal(i18n.t("fr", {id: "greeting", defaultMessage: "Hello"}), "Hello");
            assert.ok(console_spy.error() > 0);
        });

        it("does not report a missing translation to the logger", async (t) => {
            const console_spy = spyConsole(t);
            const i18n = createI18n({default_locale: "en", locales: ["fr"]});
            const log = spyLogger();
            await i18n.load(fakeReader({"i18n/fr.json": {other: "Autre"}}), log);
            assert.equal(i18n.t("fr", {id: "greeting", defaultMessage: "Hi {name}"}, {name: "World"}), "Hi World");
            assert.equal(i18n.t("de", {id: "greeting", defaultMessage: "Hi"}), "Hi");
            assert.equal(i18n.t("fr", {defaultMessage: "Bye"}), "Bye");
            assert.deepEqual(log.calls, []);
            assert.equal(console_spy.any(), 0);
        });

        it("does not report a missing translation to the console before loading", (t) => {
            const console_spy = spyConsole(t);
            const i18n = createI18n({default_locale: "en", messages: {fr: {other: "Autre"}}});
            assert.equal(i18n.t("fr", {id: "greeting", defaultMessage: "Hi"}), "Hi");
            assert.equal(i18n.t("ko", {id: "greeting", defaultMessage: "Hi"}), "Hi");
            assert.equal(i18n.t("en", {defaultMessage: "Bye"}), "Bye");
            assert.equal(console_spy.any(), 0);
        });

        it("reports a malformed locale and returns source text formatted in default_locale", async (t) => {
            const console_spy = spyConsole(t);
            const i18n = createI18n({
                default_locale: "de",
                locales: ["fr_FR!"],
                messages: {"en_US!": {amount: "{n} wrong"}, "ko": {amount: "{n} 원"}},
            });
            const log = spyLogger();
            await i18n.load(fakeReader({"i18n/fr_FR!.json": {amount: "{n} faux"}}), log);
            const message = {id: "amount", defaultMessage: "{n, number} Euro"} as const;
            // "\u212Ao" lowercases to "ko" outside ASCII.
            for(const locale of ["en_US!", "fr_FR!", "", "x", "en--US", "\u212Ao"]) {
                log.calls.length = 0;
                assert.equal(i18n.t(locale, message, {n: 1234.5}), "1.234,5 Euro", JSON.stringify(locale));
                assert.ok(log.calls.length > 0, JSON.stringify(locale));
            }
            assert.equal(console_spy.any(), 0);
        });

        it("reports a malformed locale through the logger of a later load", async (t) => {
            spyConsole(t);
            const i18n = createI18n({default_locale: "en"});
            i18n.t("en_US!", {defaultMessage: "Hi"});
            const log = spyLogger();
            await i18n.load(fakeReader({}), log);
            assert.equal(i18n.t("en_US!", {defaultMessage: "Hi"}), "Hi");
            assert.ok(log.calls.length > 0);
        });
    });

    describe("bind", () => {
        it("translates like t for the bound locale across seeded, missing, and interpolated messages", () => {
            const i18n = createI18n({default_locale: "en", messages: {fr: {greeting: "Bonjour {name}", Hi: "Salut"}}});
            const fr = i18n.bind("fr");
            const seeded = {id: "greeting", defaultMessage: "Hi {name}"} as const;
            assert.equal(fr.t(seeded, {name: "A"}), "Bonjour A");
            assert.equal(fr.t(seeded, {name: "A"}), i18n.t("fr", seeded, {name: "A"}));
            const id_less = {defaultMessage: "Hi"} as const;
            assert.equal(fr.t(id_less), "Salut");
            const missing = {id: "absent", defaultMessage: "Count {n}"} as const;
            assert.equal(fr.t(missing, {n: 3}), "Count 3");
        });

        it("sees catalogs loaded after binding", async () => {
            const i18n = createI18n({default_locale: "en", locales: ["fr"]});
            const fr = i18n.bind("fr");
            const message = {defaultMessage: "Hi"};
            assert.equal(fr.t(message), "Hi");
            await i18n.load(fakeReader({"i18n/fr.json": {Hi: "Salut"}}));
            assert.equal(fr.t(message), "Salut");
        });

        it("keeps bound translators of different locales independent", () => {
            const i18n = createI18n({default_locale: "en", messages: {fr: {Hi: "Salut"}, ko: {Hi: "안녕"}}});
            const fr = i18n.bind("fr");
            const ko = i18n.bind("ko");
            const en = i18n.bind("en");
            const message = {defaultMessage: "Hi"};
            assert.deepEqual([fr.t(message), ko.t(message), en.t(message), fr.t(message)], ["Salut", "안녕", "Hi", "Salut"]);
            assert.equal(i18n.t("fr", message), "Salut");
        });

        it("exposes the exact bound locale even when translation falls back", () => {
            const i18n = createI18n({default_locale: "en"});
            for(const locale of ["fr", "en-US", "zh-Hant-TW", "de"]) {
                const bound = i18n.bind(locale);
                assert.equal(bound.t({defaultMessage: "Hi"}), "Hi");
                assert.equal(bound.locale, locale);
            }

            const fr = i18n.bind("fr");
            // Type-level checks only; never invoked.
            const typeChecks = (): void => {
                fr.locale satisfies "fr";
                // @ts-expect-error the bound locale is readonly.
                fr.locale = "fr";
                // @ts-expect-error binding preserves the supplied literal.
                fr.locale satisfies "en";
            };
            void typeChecks;
        });
    });
});
