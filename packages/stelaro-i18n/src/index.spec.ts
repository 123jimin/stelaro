import assert from "node:assert/strict";
import {describe, it} from "node:test";

import type {DataAccess, Logger} from "@jiminp/stelaro";

import {createI18n, defineMessages} from "./index.ts";

/** A DataAccess stand-in serving catalogs from memory (only `read().optional().json()` is used). */
function fakeData(catalogs: Record<string, Record<string, string>>): DataAccess {
    return {
        dir: "/fake",
        resolve: (subpath: string) => `/fake/${subpath}`,
        read: (subpath: string) => ({
            optional: () => ({
                json: () => Promise.resolve(catalogs[subpath] ?? null),
            }),
        }),
        write: () => { throw new Error("write is not used in these tests"); },
    } as unknown as DataAccess;
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
        await i18n.load(fakeData({"i18n/fr.json": {greeting: "Bonjour {name}"}}));
        assert.equal(
            i18n.t("fr", {id: "greeting", defaultMessage: "Hi {name}"}, {name: "World"}),
            "Bonjour World",
        );
    });

    it("falls back to source for an unloaded locale", async () => {
        const i18n = createI18n({default_locale: "en", locales: ["fr"]});
        await i18n.load(fakeData({"i18n/fr.json": {greeting: "Bonjour {name}"}}));
        assert.equal(
            i18n.t("de", {id: "greeting", defaultMessage: "Hi {name}"}, {name: "World"}),
            "Hi World",
        );
    });

    it("falls back to source when a catalog file is absent", async () => {
        const i18n = createI18n({default_locale: "en", locales: ["fr"]});
        await i18n.load(fakeData({})); // no i18n/fr.json
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
        await i18n.load(fakeData({"i18n/fr.json": {greeting: "Salut {name}"}}));
        assert.equal(i18n.t("fr", M.greeting, {name: "World"}), "Salut World");
    });

    it("reports a non-fallback error through the supplied logger, still returning text", async () => {
        const i18n = createI18n({default_locale: "en", locales: ["fr"]});
        const log = spyLogger();
        // The source has no placeholder (values arg optional), but the translation introduces one;
        // formatting it without a value is a non-fallback error.
        await i18n.load(fakeData({"i18n/fr.json": {greeting: "Bonjour {name}"}}), log);
        const out = i18n.t("fr", {id: "greeting", defaultMessage: "Hello"});
        assert.equal(typeof out, "string");
        assert.ok(out.length > 0); // never blanks
        assert.ok(log.errors.length > 0); // routed through the logger, not the console
    });

    it("does not report a missing translation (by-design fallback)", async () => {
        const i18n = createI18n({default_locale: "en", locales: ["fr"]});
        const log = spyLogger();
        await i18n.load(fakeData({}), log); // no fr catalog → missing translation for the id
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
});
