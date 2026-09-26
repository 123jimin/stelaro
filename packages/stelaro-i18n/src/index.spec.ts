import assert from "node:assert/strict";
import {describe, it} from "node:test";

import {type CatalogReader, createI18n, defineMessages, type Logger} from "./index.ts";

/** A CatalogReader stand-in serving catalogs from memory; an absent subpath resolves to null. */
function fakeReader(catalogs: Record<string, Record<string, string>>): CatalogReader {
    return (subpath: string) => Promise.resolve(catalogs[subpath] ?? null);
}

type SpyLogger = Logger & {readonly errors: unknown[][]};

/** A Logger stand-in recording the arguments of every `error` call. */
function spyLogger(): SpyLogger {
    const errors: unknown[][] = [];
    return {
        errors,
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: (...args: unknown[]) => { errors.push(args); },
    };
}

describe("stelaro-i18n", () => {
    it("returns source text before any catalog is loaded", () => {
        const i18n = createI18n({default_locale: "en"});
        assert.equal(i18n.t("en", {id: "greeting", defaultMessage: "Hello"}), "Hello");
    });

    it("interpolates simple placeholders from the source", () => {
        const i18n = createI18n({default_locale: "en"});
        assert.equal(
            i18n.t("en", {id: "greeting", defaultMessage: "Hi {name}"}, {name: "World"}),
            "Hi World",
        );
    });

    it("formats ICU plurals from the source", () => {
        const i18n = createI18n({default_locale: "en"});
        const messages = defineMessages({
            items: {id: "items", defaultMessage: "{count, plural, one {# item} other {# items}}"},
        });
        assert.equal(i18n.t("en", messages.items, {count: 1}), "1 item");
        assert.equal(i18n.t("en", messages.items, {count: 2}), "2 items");
    });

    it("uses the loaded translation for the requested locale", async () => {
        const i18n = createI18n({default_locale: "en", locales: ["fr"]});
        await i18n.load(fakeReader({"i18n/fr.json": {greeting: "Bonjour {name}"}}));
        assert.equal(
            i18n.t("fr", {id: "greeting", defaultMessage: "Hi {name}"}, {name: "World"}),
            "Bonjour World",
        );
    });

    it("falls back to source for an unloaded locale", async () => {
        const i18n = createI18n({default_locale: "en", locales: ["fr"]});
        await i18n.load(fakeReader({"i18n/fr.json": {greeting: "Bonjour {name}"}}));
        assert.equal(
            i18n.t("de", {id: "greeting", defaultMessage: "Hi {name}"}, {name: "World"}),
            "Hi World",
        );
    });

    it("falls back to source when a catalog file is absent", async () => {
        const i18n = createI18n({default_locale: "en", locales: ["fr"]});
        await i18n.load(fakeReader({})); // no i18n/fr.json
        assert.equal(
            i18n.t("fr", {id: "greeting", defaultMessage: "Hi {name}"}, {name: "World"}),
            "Hi World",
        );
    });

    it("treats an undefined reader result as an absent catalog", async () => {
        const i18n = createI18n({default_locale: "en", locales: ["fr"]});
        await i18n.load(() => Promise.resolve());
        assert.equal(i18n.t("fr", {id: "greeting", defaultMessage: "Hi"}), "Hi");
    });

    it("loads only the default locale when `locales` is omitted", async () => {
        const i18n = createI18n({default_locale: "ko"});
        const requested: string[] = [];
        await i18n.load((subpath) => {
            requested.push(subpath);
            return Promise.resolve({greeting: "안녕"});
        });
        assert.deepEqual(requested, ["i18n/ko.json"]);
        assert.equal(i18n.t("ko", {id: "greeting", defaultMessage: "Hi"}), "안녕");
    });

    it("reads catalogs under a custom catalog_dir", async () => {
        const i18n = createI18n({default_locale: "en", locales: ["fr"], catalog_dir: "lang"});
        await i18n.load(fakeReader({"lang/fr.json": {greeting: "Salut"}}));
        assert.equal(i18n.t("fr", {id: "greeting", defaultMessage: "Hi"}), "Salut");
    });

    it("keeps the seed when the reader finds no catalog", async () => {
        const i18n = createI18n({default_locale: "en", locales: ["fr"], messages: {fr: {greeting: "Bonjour"}}});
        await i18n.load(fakeReader({}));
        assert.equal(i18n.t("fr", {id: "greeting", defaultMessage: "Hi"}), "Bonjour");
    });

    it("falls back to the literal key when defaultMessage is empty", () => {
        const i18n = createI18n({default_locale: "en"});
        assert.equal(i18n.t("fr", {id: "greeting", defaultMessage: ""}), "greeting");
    });

    it("falls back to source formatted in default_locale for a malformed locale tag", () => {
        const i18n = createI18n({default_locale: "de"});
        const message = {defaultMessage: "{n, number} items"} as const;
        const original = console.error;
        const reported: unknown[][] = [];
        console.error = (...args: unknown[]) => { reported.push(args); };
        try {
            for(const locale of ["en_US", ""]) {
                assert.equal(i18n.t(locale, message, {n: 1000}), "1.000 items");
                assert.equal(i18n.bind(locale).t(message, {n: 1000}), "1.000 items");
            }
            assert.ok(reported.length > 0);
        } finally {
            console.error = original;
        }
    });

    it("uses the loaded catalog for a well-formed locale without runtime data", async () => {
        const i18n = createI18n({default_locale: "de", locales: ["xx"]});
        await i18n.load(fakeReader({"i18n/xx.json": {count: "xx items"}}), spyLogger());
        assert.equal(i18n.t("xx", {id: "count", defaultMessage: "items"}), "xx items");
    });

    it("rejects a malformed default_locale", () => {
        assert.throws(() => createI18n({default_locale: "en_US"}), RangeError);
    });

    it("rebuilds from the seed on each load, dropping ids the reader no longer returns", async () => {
        const i18n = createI18n({default_locale: "en", locales: ["fr"], messages: {fr: {greeting: "Salut"}}});
        await i18n.load(fakeReader({"i18n/fr.json": {greeting: "Bonjour", farewell: "Au revoir"}}));
        await i18n.load(fakeReader({}));
        assert.equal(i18n.t("fr", {id: "greeting", defaultMessage: "Hi"}), "Salut");
        assert.equal(i18n.t("fr", {id: "farewell", defaultMessage: "Bye"}), "Bye");
    });

    it("keeps the previous catalogs when the reader rejects", async () => {
        const i18n = createI18n({default_locale: "en", locales: ["fr", "ko"]});
        await i18n.load(fakeReader({"i18n/fr.json": {greeting: "Bonjour"}}));
        const failing: CatalogReader = (subpath) => subpath.endsWith("ko.json")
            ? Promise.reject(new Error("read failed"))
            : Promise.resolve({greeting: "Salut"});
        await assert.rejects(i18n.load(failing));
        assert.equal(i18n.t("fr", {id: "greeting", defaultMessage: "Hi"}), "Bonjour");
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
            // @ts-expect-error bind types values the same way.
            fr.t({defaultMessage: "Hi {name}"});
            i18n.t("en", {defaultMessage: "Hi"});
            i18n.t("en", {defaultMessage: "{count, plural, one {# item} other {# items}}"}, {count: 1, extra: "y"});
        };
        void typeChecks;
    });

    it("reports a non-fallback error through the supplied logger, still returning text", async () => {
        const i18n = createI18n({default_locale: "en", locales: ["fr"]});
        const log = spyLogger();
        // The source has no placeholder (values arg optional), but the translation introduces one;
        // formatting it without a value is a non-fallback error.
        await i18n.load(fakeReader({"i18n/fr.json": {greeting: "Bonjour {name}"}}), log);
        assert.equal(i18n.t("fr", {id: "greeting", defaultMessage: "Hello"}), "Hello");
        assert.ok(log.errors.length > 0); // routed through the logger, not the console
    });

    it("does not report a missing translation (by-design fallback)", async () => {
        const i18n = createI18n({default_locale: "en", locales: ["fr"]});
        const log = spyLogger();
        await i18n.load(fakeReader({}), log); // no fr catalog → missing translation for the id
        assert.equal(
            i18n.t("fr", {id: "greeting", defaultMessage: "Hi {name}"}, {name: "World"}),
            "Hi World",
        );
        assert.equal(log.errors.length, 0);
    });

    it("degrades to the console when no logger was supplied, never throwing", () => {
        const i18n = createI18n({default_locale: "en"}); // never loaded → no logger
        const original = console.error;
        const reported: unknown[][] = [];
        console.error = (...args: unknown[]) => { reported.push(args); };
        try {
            // Malformed ICU source: an unclosed plural argument. Unparseable regardless of values.
            const source = "{count, plural, one {# item}";
            assert.equal(i18n.t("en", {id: "bad", defaultMessage: source}, {count: 1}), source);
            assert.ok(reported.length > 0); // console is the last-resort sink
        } finally {
            console.error = original;
        }
    });

    it("translates from an in-memory seeded catalog with no load (no DataAccess)", () => {
        const i18n = createI18n({default_locale: "en", messages: {fr: {greeting: "Bonjour {name}"}}});
        // Never calls load; no DataAccess exists in this test at all.
        assert.equal(
            i18n.t("fr", {id: "greeting", defaultMessage: "Hi {name}"}, {name: "World"}),
            "Bonjour World",
        );
    });

    it("falls back to source for an id absent from the seeded catalog", () => {
        const i18n = createI18n({default_locale: "en", messages: {fr: {other: "Autre"}}});
        assert.equal(
            i18n.t("fr", {id: "greeting", defaultMessage: "Hi {name}"}, {name: "World"}),
            "Hi World",
        );
    });

    it("seeds a locale not listed in `locales` (seeding is independent of the load allow-list)", () => {
        const i18n = createI18n({default_locale: "en", locales: ["de"], messages: {fr: {greeting: "Bonjour"}}});
        assert.equal(i18n.t("fr", {id: "greeting", defaultMessage: "Hi"}), "Bonjour");
    });

    it("overlays load over the seed at the id level", async () => {
        const i18n = createI18n({
            default_locale: "en",
            locales: ["fr"],
            messages: {fr: {greeting: "Bonjour", farewell: "Au revoir"}},
        });
        await i18n.load(fakeReader({"i18n/fr.json": {greeting: "Salut"}}));
        assert.equal(i18n.t("fr", {id: "greeting", defaultMessage: "Hi"}), "Salut"); // loaded id wins
        assert.equal(i18n.t("fr", {id: "farewell", defaultMessage: "Bye"}), "Au revoir"); // seeded-only survives
    });

    it("keys an id-less descriptor by its source text (gettext-style)", () => {
        const i18n = createI18n({default_locale: "en", messages: {fr: {"Hi {name}": "Bonjour {name}"}}});
        assert.equal(i18n.t("fr", {defaultMessage: "Hi {name}"}, {name: "World"}), "Bonjour World");
    });

    it("falls back to source text for an id-less descriptor absent from the catalog", () => {
        const i18n = createI18n({default_locale: "en", messages: {fr: {other: "Autre"}}});
        assert.equal(i18n.t("fr", {defaultMessage: "Hi {name}"}, {name: "World"}), "Hi World");
    });

    it("an explicit id wins over the source-text key", () => {
        const i18n = createI18n({default_locale: "en", messages: {fr: {greeting: "Par id", Hi: "Par texte"}}});
        assert.equal(i18n.t("fr", {id: "greeting", defaultMessage: "Hi"}), "Par id");
    });

    it("bind(locale).t equals t(locale, …) for an id-less descriptor", () => {
        const i18n = createI18n({default_locale: "en", messages: {fr: {Hi: "Salut"}}});
        assert.equal(i18n.bind("fr").t({defaultMessage: "Hi"}), i18n.t("fr", {defaultMessage: "Hi"}));
        assert.equal(i18n.bind("fr").t({defaultMessage: "Hi"}), "Salut");
    });

    it("bind(locale).t equals t(locale, …) across seeded, missing-id, and interpolated messages", () => {
        const i18n = createI18n({default_locale: "en", messages: {fr: {greeting: "Bonjour {name}"}}});
        const fr = i18n.bind("fr");
        const seeded = {id: "greeting", defaultMessage: "Hi {name}"} as const;
        assert.equal(fr.t(seeded, {name: "A"}), i18n.t("fr", seeded, {name: "A"}));
        const missing = {id: "absent", defaultMessage: "Fallback"} as const;
        assert.equal(fr.t(missing), i18n.t("fr", missing));
        const interpolated = {id: "count", defaultMessage: "Count {n}"} as const;
        assert.equal(fr.t(interpolated, {n: 3}), i18n.t("fr", interpolated, {n: 3}));
    });
});
