import assert from "node:assert/strict";
import {describe, it} from "node:test";

import type {DataAccess} from "@jiminp/stelaro";

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
});
