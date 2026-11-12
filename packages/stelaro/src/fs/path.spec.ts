import {equal, notEqual, ok} from "node:assert/strict";
import {isAbsolute, join, resolve} from "node:path";
import {test} from "node:test";

import {createFluentPath} from "../index.js";
import {createTemporaryDirectory} from "../test-util.js";

test("paths are absolute and immutable, and join permits traversal", () => {
    const base = createFluentPath("data");
    equal(base.path, resolve("data"));
    ok(isAbsolute(base.path));
    ok(Object.isFrozen(base));
    notEqual(base.join(), base);
    notEqual(base.confine(), base);
    equal(base.join("..", "sibling").path, resolve("sibling"));
    equal(base.path, resolve("data"));
});

test("confine resolves mixed separators and stops traversal at its base", () => {
    const base = createFluentPath("data");
    equal(base.confine("a\\b/c", "..\\..", ".", "d").path, join(base.path, "a", "d"));
    equal(base.confine("a", "../../../", "..\\").path, base.path);
    equal(base.confine("a", "/rooted/name").path, join(base.path, "rooted", "name"));
    equal(base.confine("a", "\\rooted\\name").path, join(base.path, "rooted", "name"));
    equal(base.confine("a", "Z:\\rooted/name").path, join(base.path, "rooted", "name"));
    equal(base.confine("a", "Z:rooted", "name").path, join(base.path, "rooted", "name"));
    equal(base.confine("a", "Z:\\..\\..", "name").path, join(base.path, "name"));
});

test("confined reads resolve from the base directory on disk", async (t) => {
    const root = await createTemporaryDirectory(t);
    const base = root.join("base");
    await root.join("file").write().text("outside");
    await base.join("file").write().text("inside");
    equal(await base.confine("nested", "..\\..\\file").read().text(), "inside");
    equal(await base.confine("nested", "/file").read().text(), "inside");
    if(process.platform === "win32") {
        equal(await base.confine(".. ", "file").read({optional: true}).text(), null);
    }
});
