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
        const M = defineMessages({
            items: {id: "items", defaultMessage: "{count, plural, one {# item} other {# items}}"},
        });
        assert.equal(i18n.t("en", M.items, {count: 1}), "1 item");
        assert.equal(i18n.t("en", M.items, {count: 2}), "2 items");
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

    it("translates a message declared with defineMessages", async () => {
        const M = defineMessages({
            greeting: {id: "greeting", defaultMessage: "Hi {name}"},
        });
        assert.equal(M.greeting.id, "greeting");

        const i18n = createI18n({default_locale: "en", locales: ["fr"]});
        await i18n.load(fakeReader({"i18n/fr.json": {greeting: "Salut {name}"}}));
        assert.equal(i18n.t("fr", M.greeting, {name: "World"}), "Salut World");
    });

    it("reports a non-fallback error through the supplied logger, still returning text", async () => {
        const i18n = createI18n({default_locale: "en", locales: ["fr"]});
        const log = spyLogger();
        // The source has no placeholder (values arg optional), but the translation introduces one;
        // formatting it without a value is a non-fallback error.
        await i18n.load(fakeReader({"i18n/fr.json": {greeting: "Bonjour {name}"}}), log);
        const out = i18n.t("fr", {id: "greeting", defaultMessage: "Hello"});
        assert.equal(typeof out, "string");
        assert.ok(out.length > 0); // never blanks
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
            const out = i18n.t("en", {id: "bad", defaultMessage: "{count, plural, one {# item}"}, {count: 1});
            assert.equal(typeof out, "string"); // degrades, never throws
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
