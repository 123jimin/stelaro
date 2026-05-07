import type {FastifyInstance} from "fastify";
import {defineFastifyGateway} from "@jiminp/peranto-fastify";

import {
    type SessionUser,
    authenticateDiscord,
    authenticateDiscordCallback,
    authenticateGoogle,
    authenticateGoogleCallback,
    requireAuth,
} from "./auth.ts";
import {CommentsCalls} from "./comments.ts";
import {ThreadsCalls} from "./threads.ts";
import {UsersCalls} from "./users.ts";

export function createGateway(server: FastifyInstance) {
    return defineFastifyGateway({
        id: "http",
        server,
        port: 3000,
        uses: [UsersCalls, ThreadsCalls, CommentsCalls],
        routes: [
            {
                method: "GET",
                path: "/",
                async handle({request, call, html}) {
                    const {threads} = await call(ThreadsCalls.calls.list, {});
                    const session_user = request.user as SessionUser | null;
                    return html`
                        <h1>BBS</h1>
                        ${session_user != null
                            ? `<nav>
                                Logged in as ${session_user.display_name}
                                <form method="post" action="/logout" style="display:inline">
                                    <button type="submit">Logout</button>
                                </form>
                                | <a href="/threads/new">New Thread</a>
                            </nav>`
                            : `<nav><a href="/login">Login</a></nav>`
                        }
                        <ul>
                            ${threads.map((t) => `
                                <li>
                                    <a href="/threads/${t.thread_id}">${t.title}</a>
                                    <small>(${t.created_at})</small>
                                </li>
                            `).join("")}
                        </ul>
                    `;
                },
            },
            {
                method: "GET",
                path: "/threads/new",
                preHandler: [requireAuth],
                async handle({html}) {
                    return html`
                        <h1>New Thread</h1>
                        <form method="post" action="/threads">
                            <input type="text" name="title" placeholder="Title" required><br>
                            <textarea name="body" placeholder="Body" required></textarea><br>
                            <button type="submit">Create Thread</button>
                        </form>
                        <p><a href="/">Back</a></p>
                    `;
                },
            },
            {
                method: "GET",
                path: "/threads/:thread_id",
                async handle({request, call, html}) {
                    const {thread_id} = request.params as {thread_id: string};
                    const thread = await call(ThreadsCalls.calls.get, {thread_id});
                    if(thread == null) {
                        return html`<h1>Thread not found</h1><p><a href="/">Back</a></p>`;
                    }
                    const {comments} = await call(CommentsCalls.calls.list_by_thread, {thread_id});
                    const session_user = request.user as SessionUser | null;
                    return html`
                        <h1>${thread.title}</h1>
                        <p>${thread.body}</p>
                        <small>by ${thread.author_user_id} at ${thread.created_at}</small>
                        <hr>
                        <h2>Comments</h2>
                        ${comments.length === 0 ? "<p>No comments yet.</p>" : ""}
                        ${comments.map((c) => `
                            <div>
                                <p>${c.body}</p>
                                <small>by ${c.author_user_id} at ${c.created_at}</small>
                            </div>
                        `).join("<hr>")}
                        ${session_user != null
                            ? `<hr>
                            <h3>Add Comment</h3>
                            <form method="post" action="/threads/${thread_id}/comments">
                                <textarea name="body" required></textarea><br>
                                <button type="submit">Post Comment</button>
                            </form>`
                            : `<p><a href="/login">Login to comment</a></p>`
                        }
                        <p><a href="/">Back to threads</a></p>
                    `;
                },
            },
            {
                method: "POST",
                path: "/threads",
                preHandler: [requireAuth],
                async handle({request, call, redirect}) {
                    const session_user = request.user as SessionUser;
                    const {user_id} = await call(UsersCalls.calls.resolve, {
                        provider: session_user.provider,
                        provider_account_id: session_user.provider_account_id,
                        display_name: session_user.display_name,
                    });
                    const {title, body} = request.body as {title: string; body: string};
                    const thread = await call(ThreadsCalls.calls.create, {
                        author_user_id: user_id,
                        title,
                        body,
                    });
                    return redirect(`/threads/${thread.thread_id}`);
                },
            },
            {
                method: "POST",
                path: "/threads/:thread_id/comments",
                preHandler: [requireAuth],
                async handle({request, call, redirect}) {
                    const session_user = request.user as SessionUser;
                    const {user_id} = await call(UsersCalls.calls.resolve, {
                        provider: session_user.provider,
                        provider_account_id: session_user.provider_account_id,
                        display_name: session_user.display_name,
                    });
                    const {thread_id} = request.params as {thread_id: string};
                    const {body} = request.body as {body: string};
                    await call(CommentsCalls.calls.create, {
                        thread_id,
                        author_user_id: user_id,
                        body,
                    });
                    return redirect(`/threads/${thread_id}`);
                },
            },
            {
                method: "GET",
                path: "/login",
                async handle({html}) {
                    return html`
                        <h1>Login</h1>
                        <ul>
                            <li><a href="/login/google">Login with Google</a></li>
                            <li><a href="/login/discord">Login with Discord</a></li>
                        </ul>
                        <h2>Login with ID</h2>
                        <form method="post" action="/login/id">
                            <input type="text" name="name" placeholder="Your name" required>
                            <button type="submit">Login</button>
                        </form>
                        <p><a href="/">Back</a></p>
                    `;
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
            {
                method: "POST",
                path: "/login/id",
                async handle({request, call, redirect}) {
                    const {name} = request.body as {name: string};
                    const session_user: SessionUser = {
                        provider: "id",
                        provider_account_id: name,
                        display_name: name,
                    };
                    await request.login(session_user);
                    await call(UsersCalls.calls.resolve, {
                        provider: "id",
                        provider_account_id: name,
                        display_name: name,
                    });
                    return redirect("/");
                },
            },
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
