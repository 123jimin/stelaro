import {defineComponent} from "@jiminp/stelaro";
import {defineFastifyRoutes, route, sendHtml} from "@jiminp/stelaro-fastify";
import {type as schema} from "arktype";

import {requireAuth} from "./auth.ts";
import {CommentsCalls} from "./comments.ts";
import {markup, THREAD_NOT_FOUND_HTML} from "./html.ts";
import {appendJsonl, readJsonl} from "./storage.ts";
import {type ThreadRecord, ThreadsCalls, ThreadSchema} from "./threads-calls.ts";
import {UsersCalls} from "./users.ts";

const DATA_PATH = "threads.jsonl";

export const ThreadsComponent = defineComponent({
    calls: ThreadsCalls,
    uses: [],
    handlers: {
        create: {
            async handle(context, input) {
                const record: ThreadRecord = {
                    thread_id: crypto.randomUUID(),
                    author_user_id: input.author_user_id,
                    title: input.title,
                    body: input.body,
                    created_at: new Date().toISOString(),
                };
                await appendJsonl(context.data, DATA_PATH, record);
                context.log.info({event: "thread.created", thread_id: record.thread_id}, "Thread created.");
                return record;
            },
        },
        list: {
            async handle(context) {
                const threads = await readJsonl(context.data, DATA_PATH, ThreadSchema);
                threads.sort((a, b) => b.created_at.localeCompare(a.created_at));
                return {threads};
            },
        },
        get: {
            async handle(context, input) {
                const threads = await readJsonl(context.data, DATA_PATH, ThreadSchema);
                return threads.find((t) => t.thread_id === input.thread_id) ?? null;
            },
        },
    },
});

export const ThreadsRoutes = defineFastifyRoutes({
    uses: [ThreadsCalls, CommentsCalls, UsersCalls],
    routes: [
        {
            method: "GET",
            path: "/",
            async handle({request, call, html}) {
                const {threads} = await call(ThreadsCalls.calls.list, {});
                const session_user = request.user ?? null;
                return html(markup`
                    <header>
                        <h1>BBS</h1>
                        <nav>
                            ${session_user != null
                                    ? markup`Logged in as ${session_user.display_name}
                                    <form method="post" action="/logout" style="display:inline">
                                        <button type="submit">Logout</button>
                                    </form>
                                    | <a href="/threads/new">New Thread</a>`
                                    : markup`<a href="/login">Login</a>`
                            }
                        </nav>
                    </header>
                    <main>
                        ${threads.map((t) => markup`
                            <article>
                                <a href="/threads/${t.thread_id}">${t.title}</a>
                                <footer><time>${t.created_at}</time></footer>
                            </article>
                        `)}
                    </main>
                `.html);
            },
        },
        {
            method: "GET",
            path: "/threads/new",
            preHandler: [requireAuth],
            async handle({html}) {
                return html(`
                    <h1>New Thread</h1>
                    <form method="post" action="/threads">
                        <label>Title<br><input type="text" name="title" required></label>
                        <label>Body<br><textarea name="body" required></textarea></label>
                        <button type="submit">Create Thread</button>
                    </form>
                    <nav><a href="/">Back</a></nav>
                `);
            },
        },
        route({
            method: "GET",
            path: "/threads/:thread_id",
            params: schema({thread_id: "string"}),
            async handle({request, reply, params, call, html}) {
                const thread = await call(ThreadsCalls.calls.get, {thread_id: params.thread_id});
                if(thread == null) {
                    return sendHtml(reply.status(404), THREAD_NOT_FOUND_HTML);
                }
                const {comments} = await call(CommentsCalls.calls.listByThread, {thread_id: thread.thread_id});
                const session_user = request.user ?? null;
                return html(markup`
                    <article>
                        <h1>${thread.title}</h1>
                        <p>${thread.body}</p>
                        <footer>by ${thread.author_user_id} at <time>${thread.created_at}</time></footer>
                    </article>
                    <section>
                        <h2>Comments</h2>
                        ${comments.length === 0 ? markup`<p>No comments yet.</p>` : ""}
                        ${comments.map((c) => markup`
                            <article>
                                <p>${c.body}</p>
                                <footer>by ${c.author_user_id} at <time>${c.created_at}</time></footer>
                            </article>
                        `)}
                        ${session_user != null
                                ? markup`<form method="post" action="/threads/${thread.thread_id}/comments">
                                <label>Comment<br><textarea name="body" required></textarea></label>
                                <button type="submit">Post Comment</button>
                            </form>`
                                : markup`<p><a href="/login">Login to comment</a></p>`
                        }
                    </section>
                    <nav><a href="/">Back to threads</a></nav>
                `.html);
            },
        }),
        route({
            method: "POST",
            path: "/threads",
            preHandler: [requireAuth],
            body: schema({title: "string", body: "string"}),
            async handle({request, body: form, call, redirect}) {
                if(request.user == null) return;
                const {user_id} = await call(UsersCalls.calls.resolve, {
                    provider: request.user.provider,
                    provider_account_id: request.user.provider_account_id,
                    display_name: request.user.display_name,
                });
                const thread = await call(ThreadsCalls.calls.create, {
                    author_user_id: user_id,
                    title: form.title,
                    body: form.body,
                });
                redirect(`/threads/${thread.thread_id}`);
            },
        }),
    ],
});
