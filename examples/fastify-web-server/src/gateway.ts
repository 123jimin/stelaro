import {defineFastifyGateway, route} from "@jiminp/peranto-fastify";
import {type as schema} from "arktype";
import type {FastifyInstance} from "fastify";

import {
    authenticateDiscord,
    authenticateDiscordCallback,
    authenticateGoogle,
    authenticateGoogleCallback,
    requireAuth,
    type SessionUser,
} from "./auth.ts";
import {CommentsCalls} from "./comments.ts";
import {ThreadsCalls} from "./threads.ts";
import {UsersCalls} from "./users.ts";

export function createGateway(server: FastifyInstance) {
    return defineFastifyGateway({
        id: "http",
        server,
        uses: [UsersCalls, ThreadsCalls, CommentsCalls],
        routes: [
            {
                method: "GET",
                path: "/",
                async handle({request, call, html}) {
                    const {threads} = await call(ThreadsCalls.calls.list, {});
                    const session_user = request.user as SessionUser | null;
                    return html(`
                        <header>
                            <h1>BBS</h1>
                            <nav>
                                ${session_user != null
                                        ? `Logged in as ${session_user.display_name}
                                        <form method="post" action="/logout" style="display:inline">
                                            <button type="submit">Logout</button>
                                        </form>
                                        | <a href="/threads/new">New Thread</a>`
                                        : `<a href="/login">Login</a>`
                                }
                            </nav>
                        </header>
                        <main>
                            ${threads.map((t) => `
                                <article>
                                    <a href="/threads/${t.thread_id}">${t.title}</a>
                                    <footer><time>${t.created_at}</time></footer>
                                </article>
                            `).join("")}
                        </main>
                    `);
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
                        return reply.status(404).type("text/html").send(
                            `<h1>Thread not found</h1><nav><a href="/">Back</a></nav>`,
                        );
                    }
                    const {comments} = await call(CommentsCalls.calls.list_by_thread, {thread_id: params.thread_id});
                    const session_user = request.user as SessionUser | null;
                    return html(`
                        <article>
                            <h1>${thread.title}</h1>
                            <p>${thread.body}</p>
                            <footer>by ${thread.author_user_id} at <time>${thread.created_at}</time></footer>
                        </article>
                        <section>
                            <h2>Comments</h2>
                            ${comments.length === 0 ? "<p>No comments yet.</p>" : ""}
                            ${comments.map((c) => `
                                <article>
                                    <p>${c.body}</p>
                                    <footer>by ${c.author_user_id} at <time>${c.created_at}</time></footer>
                                </article>
                            `).join("")}
                            ${session_user != null
                                    ? `<form method="post" action="/threads/${params.thread_id}/comments">
                                    <label>Comment<br><textarea name="body" required></textarea></label>
                                    <button type="submit">Post Comment</button>
                                </form>`
                                    : `<p><a href="/login">Login to comment</a></p>`
                            }
                        </section>
                        <nav><a href="/">Back to threads</a></nav>
                    `);
                },
            }),
            route({
                method: "POST",
                path: "/threads",
                preHandler: [requireAuth],
                body: schema({title: "string", body: "string"}),
                async handle({request, body: form, call, redirect}) {
                    const session_user = request.user as SessionUser;
                    const {user_id} = await call(UsersCalls.calls.resolve, {
                        provider: session_user.provider,
                        provider_account_id: session_user.provider_account_id,
                        display_name: session_user.display_name,
                    });
                    const thread = await call(ThreadsCalls.calls.create, {
                        author_user_id: user_id,
                        title: form.title,
                        body: form.body,
                    });
                    return redirect(`/threads/${thread.thread_id}`);
                },
            }),
            route({
                method: "POST",
                path: "/threads/:thread_id/comments",
                preHandler: [requireAuth],
                params: schema({thread_id: "string"}),
                body: schema({body: "string"}),
                async handle({request, params, body: form, call, redirect}) {
                    const session_user = request.user as SessionUser;
                    const {user_id} = await call(UsersCalls.calls.resolve, {
                        provider: session_user.provider,
                        provider_account_id: session_user.provider_account_id,
                        display_name: session_user.display_name,
                    });
                    await call(CommentsCalls.calls.create, {
                        thread_id: params.thread_id,
                        author_user_id: user_id,
                        body: form.body,
                    });
                    return redirect(`/threads/${params.thread_id}`);
                },
            }),
            {
                method: "GET",
                path: "/login",
                async handle({html}) {
                    return html(`
                        <h1>Login</h1>
                        <section>
                            <nav>
                                <ul>
                                    <li><a href="/login/google">Login with Google</a></li>
                                    <li><a href="/login/discord">Login with Discord</a></li>
                                </ul>
                            </nav>
                        </section>
                        <section>
                            <h2>Login with ID</h2>
                            <form method="post" action="/login/id">
                                <label>Name<br><input type="text" name="name" required></label>
                                <button type="submit">Login</button>
                            </form>
                        </section>
                        <nav><a href="/">Back</a></nav>
                    `);
                },
            },
            {
                method: "GET",
                path: "/login/google",
                preValidation: [authenticateGoogle],
                async handle() {},
            },
            {
                method: "GET",
                path: "/login/google/callback",
                preValidation: [authenticateGoogleCallback],
                async handle({redirect}) {
                    return redirect("/");
                },
            },
            {
                method: "GET",
                path: "/login/discord",
                preValidation: [authenticateDiscord],
                async handle() {},
            },
            {
                method: "GET",
                path: "/login/discord/callback",
                preValidation: [authenticateDiscordCallback],
                async handle({redirect}) {
                    return redirect("/");
                },
            },
            route({
                method: "POST",
                path: "/login/id",
                body: schema({name: "string"}),
                async handle({request, body: form, call, redirect}) {
                    const session_user: SessionUser = {
                        provider: "id",
                        provider_account_id: form.name,
                        display_name: form.name,
                    };
                    await request.login(session_user);
                    await call(UsersCalls.calls.resolve, {
                        provider: "id",
                        provider_account_id: form.name,
                        display_name: form.name,
                    });
                    return redirect("/");
                },
            }),
            {
                method: "POST",
                path: "/logout",
                async handle({request, redirect}) {
                    await request.logout();
                    return redirect("/");
                },
            },
        ],
    });
}
