import {equal, ok, rejects} from "node:assert/strict";
import {test} from "node:test";

import {NotRegularFileError, StelaroError} from "../index.js";
import {createTemporaryDirectory} from "../test-util.js";

test("required and optional readers reject directories with a structured error", async (t) => {
    const base = await createTemporaryDirectory(t);
    for(const reader of [base.read(), base.read({optional: true})]) {
        await rejects(reader.buffer(), (error) => {
            ok(error instanceof NotRegularFileError);
            ok(error instanceof StelaroError);
            equal(error.file_path, base.path);
            return true;
        });
    }
});
