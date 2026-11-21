import {deepEqual, equal, match, ok} from "node:assert/strict";
import {spawn} from "node:child_process";
import {appendFile} from "node:fs/promises";
import {join, resolve} from "node:path";
import process from "node:process";
import {test} from "node:test";

import type {CommentRecord} from "./comments.ts";
import {
    createTemporaryDirectory, extractCookieHeader, readRawJsonlLines, startBbsApplication, writeWebConfig,
} from "./test-util.ts";
import type {ThreadRecord} from "./threads/index.ts";

test("HTTP routes enforce auth, attribute creation to session user, order threads/comments, and stay immutable and unpaginated", async (t) => {
    const base_dir = await createTemporaryDirectory(t);
    const {app, base_url, config_dir, data_dir} = await startBbsApplication(t, base_dir, "Initial BBS");

    // Unauthenticated users cannot view new-thread form or create threads/comments.
    const unauth_form = await fetch(`${base_url}/threads/new`, {redirect: "manual"});
    equal(unauth_form.status, 302);
    equal(unauth_form.headers.get("location"), "/login");

    const unauth_thread = await fetch(`${base_url}/threads`, {
        method: "POST",
        headers: {"content-type": "application/x-www-form-urlencoded"},
        body: new URLSearchParams({title: "Nope", body: "Blocked"}).toString(),
        redirect: "manual",
    });
    equal(unauth_thread.status, 401);

    // Log in with ID login.
    const login = await fetch(`${base_url}/login/id`, {
        method: "POST",
        headers: {"content-type": "application/x-www-form-urlencoded"},
        body: new URLSearchParams({name: "dave"}).toString(),
        redirect: "manual",
    });
    equal(login.status, 303);
    const cookie = extractCookieHeader(login);

    // Authenticated new-thread form renders validated site_title from config/web.toml.
    const new_form = await fetch(`${base_url}/threads/new`, {headers: {cookie}});
    equal(new_form.status, 200);
    const new_form_html = await new_form.text();
    match(new_form_html, /Initial BBS/u);
    match(new_form_html, /action="\/threads"/u);

    // Config reload updates gateway configuration dynamically.
    await writeWebConfig(config_dir, "Reloaded BBS");
    await app.reloadComponentConfig("web");
    const reloaded_home = await fetch(`${base_url}/`);
    match(await reloaded_home.text(), /Reloaded BBS/u);

    // Create three threads; verify any forged author_user_id in the form is ignored in favor of the session user.
    const created_locations: string[] = [];
    for(const [title, body] of [["Thread One", "Body 1"], ["Thread Two", "Body 2"], ["Thread Three", "Body 3"]] as const) {
        const response = await fetch(`${base_url}/threads`, {
            method: "POST",
            headers: {
                "content-type": "application/x-www-form-urlencoded",
                "cookie": cookie,
            },
            body: new URLSearchParams({title, body, author_user_id: "forged-id"}).toString(),
            redirect: "manual",
        });
        equal(response.status, 303);
        const location = response.headers.get("location")!;
        match(location, /^\/threads\/[^/]+$/u);
        created_locations.push(location);
    }

    // GET / lists all threads newest-first and ignores pagination query parameters.
    const list_response = await fetch(`${base_url}/?page=2&limit=1`);
    equal(list_response.status, 200);
    const list_html = await list_response.text();
    const pos_three = list_html.indexOf("Thread Three");
    const pos_two = list_html.indexOf("Thread Two");
    const pos_one = list_html.indexOf("Thread One");
    ok(pos_three > 0 && pos_two > pos_three && pos_one > pos_two);

    const target_location = created_locations[0]!;
    const target_thread_id = target_location.slice("/threads/".length);

    // Unauthenticated comment creation is rejected.
    const unauth_comment = await fetch(`${base_url}${target_location}/comments`, {
        method: "POST",
        headers: {"content-type": "application/x-www-form-urlencoded"},
        body: new URLSearchParams({body: "Blocked comment"}).toString(),
        redirect: "manual",
    });
    equal(unauth_comment.status, 401);

    // Post comments in creation order.
    for(const body of ["First comment", "Second comment", "Third comment"]) {
        const response = await fetch(`${base_url}${target_location}/comments`, {
            method: "POST",
            headers: {
                "content-type": "application/x-www-form-urlencoded",
                "cookie": cookie,
            },
            body: new URLSearchParams({body}).toString(),
            redirect: "manual",
        });
        equal(response.status, 303);
        equal(response.headers.get("location"), target_location);
    }

    // Missing thread returns 404 for both detail and comment creation.
    equal((await fetch(`${base_url}/threads/nonexistent`)).status, 404);
    equal(
        (await fetch(`${base_url}/threads/nonexistent/comments`, {
            method: "POST",
            headers: {
                "content-type": "application/x-www-form-urlencoded",
                "cookie": cookie,
            },
            body: new URLSearchParams({body: "Orphan"}).toString(),
            redirect: "manual",
        })).status,
        404,
    );

    // Thread detail shows thread and creation-ordered comments.
    const detail_response = await fetch(`${base_url}${target_location}`);
    equal(detail_response.status, 200);
    const detail_html = await detail_response.text();
    match(detail_html, /Thread One/u);
    match(detail_html, /Body 1/u);
    const c1 = detail_html.indexOf("First comment");
    const c2 = detail_html.indexOf("Second comment");
    const c3 = detail_html.indexOf("Third comment");
    ok(c1 > 0 && c2 > c1 && c3 > c2);

    // Immutability: edit/delete HTTP methods are absent (404).
    equal((await fetch(`${base_url}${target_location}`, {method: "PUT", headers: {cookie}})).status, 404);
    equal((await fetch(`${base_url}${target_location}`, {method: "PATCH", headers: {cookie}})).status, 404);
    equal((await fetch(`${base_url}${target_location}`, {method: "DELETE", headers: {cookie}})).status, 404);

    // Verify exact persisted fields and uncached external JSONL appends over HTTP.
    const threads_file = join(data_dir, "threads", "threads.jsonl");
    const comments_file = join(data_dir, "comments", "comments.jsonl");
    const users = (await readRawJsonlLines(join(data_dir, "users", "users.jsonl"))).map((line) => JSON.parse(line) as {user_id: string});
    const dave_id = users[0]!.user_id;

    const stored_threads = (await readRawJsonlLines(threads_file)).map((line) => JSON.parse(line) as ThreadRecord);
    equal(stored_threads.length, 3);
    for(const thread of stored_threads) {
        equal(thread.author_user_id, dave_id);
        deepEqual(Object.keys(thread).sort(), ["author_user_id", "body", "created_at", "thread_id", "title"]);
    }

    const stored_comments = (await readRawJsonlLines(comments_file)).map((line) => JSON.parse(line) as CommentRecord);
    equal(stored_comments.length, 3);
    for(const comment of stored_comments) {
        equal(comment.author_user_id, dave_id);
        equal(comment.thread_id, target_thread_id);
        deepEqual(Object.keys(comment).sort(), ["author_user_id", "body", "comment_id", "created_at", "thread_id"]);
    }

    const external_comment: CommentRecord = {
        comment_id: "ext-http-comment",
        thread_id: target_thread_id,
        author_user_id: dave_id,
        body: "Externally appended comment",
        created_at: "2099-01-01T00:00:00.000Z",
    };
    await appendFile(comments_file, `${JSON.stringify(external_comment)}\n`, "utf8");
    const uncached_detail = await fetch(`${base_url}${target_location}`);
    match(await uncached_detail.text(), /Externally appended comment/u);
});

test("runnable entry point starts via CLI arguments and serves the secretless ID-login flow", async (t) => {
    const base_dir = await createTemporaryDirectory(t);
    const config_dir = join(base_dir, "config");
    const data_dir = join(base_dir, "data");
    await writeWebConfig(config_dir, "CLI Smoke BBS");
    const entry_point = resolve(import.meta.dirname, "main.js");
    const child = spawn(process.execPath, [entry_point, "--config-dir", config_dir, "--data-dir", data_dir], {
        stdio: ["ignore", "pipe", "pipe"],
    });
    t.after(() => {
        if(child.exitCode == null && child.signalCode == null) {
            child.kill();
        }
    });

    const {promise: listening_promise, resolve: resolveUrl, reject: rejectUrl} = Promise.withResolvers<string>();
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
        rejectUrl(new Error(`Timed out waiting for server startup.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, 10_000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
        const found = /Listening at (http:\/\/127\.0\.0\.1:\d+)\./u.exec(stdout);
        if(found != null) {
            clearTimeout(timer);
            resolveUrl(found[1]!);
        }
    });
    child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
    });
    child.once("exit", (code, signal) => {
        clearTimeout(timer);
        rejectUrl(new Error(`Server exited early (code=${code}, signal=${signal}).\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    });
    const listening_url = await listening_promise;

    const login = await fetch(`${listening_url}/login/id`, {
        method: "POST",
        headers: {"content-type": "application/x-www-form-urlencoded"},
        body: new URLSearchParams({name: "smoke-user"}).toString(),
        redirect: "manual",
    });
    equal(login.status, 303);
    const cookie = extractCookieHeader(login);

    const post_thread = await fetch(`${listening_url}/threads`, {
        method: "POST",
        headers: {
            "content-type": "application/x-www-form-urlencoded",
            "cookie": cookie,
        },
        body: new URLSearchParams({title: "Smoke Thread", body: "End-to-end works"}).toString(),
        redirect: "manual",
    });
    equal(post_thread.status, 303);
    const thread_location = post_thread.headers.get("location")!;

    const post_comment = await fetch(`${listening_url}${thread_location}/comments`, {
        method: "POST",
        headers: {
            "content-type": "application/x-www-form-urlencoded",
            "cookie": cookie,
        },
        body: new URLSearchParams({body: "Smoke Comment"}).toString(),
        redirect: "manual",
    });
    equal(post_comment.status, 303);

    const detail = await fetch(`${listening_url}${thread_location}`, {headers: {cookie}});
    equal(detail.status, 200);
    const detail_html = await detail.text();
    match(detail_html, /CLI Smoke BBS/u);
    match(detail_html, /Smoke Thread/u);
    match(detail_html, /Smoke Comment/u);
    match(detail_html, /Signed in as smoke-user/u);

    const logout = await fetch(`${listening_url}/logout`, {
        method: "POST",
        headers: {cookie},
        redirect: "manual",
    });
    equal(logout.status, 303);

    equal((await readRawJsonlLines(join(data_dir, "users", "users.jsonl"))).length, 1);
    equal((await readRawJsonlLines(join(data_dir, "threads", "threads.jsonl"))).length, 1);
    equal((await readRawJsonlLines(join(data_dir, "comments", "comments.jsonl"))).length, 1);
});
