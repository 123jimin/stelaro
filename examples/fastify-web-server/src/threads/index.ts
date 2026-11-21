import {randomUUID} from "node:crypto";

import type {ComponentCallFn} from "@jiminp/stelaro";
import {defineComponent, UserFacingError} from "@jiminp/stelaro";
import type {GatewayHandlerContext} from "@jiminp/stelaro-fastify";
import {defineFastifyRoute, defineFastifyRoutes, NotFoundError} from "@jiminp/stelaro-fastify";
import {type} from "arktype";

import {requireAuthenticated} from "../auth.ts";
import {comment_calls} from "../comments.ts";
import type {WebConfig} from "../config.ts";
import {escapeHtml, renderPage} from "../html.ts";
import {appendJsonlRecord, createWriteQueue, NonBlankString, NonEmptyString, readJsonlRecords, TrimmedNonEmptyString} from "../storage.ts";
import {user_calls} from "../users.ts";
import {thread_calls, ThreadRecord} from "./calls.ts";

export {thread_calls, ThreadRecord} from "./calls.ts";

const THREADS_FILE = "threads.jsonl";

export const threads_component = defineComponent({
    calls: thread_calls,
    uses: [user_calls],
    state: () => ({enqueueWrite: createWriteQueue()}),
    handlers: {
        async createThread(context, input) {
            const author = await context.call(user_calls.calls.getUser, {user_id: input.author_user_id});
            if(author == null) {
                throw new UserFacingError("Author user does not exist.");
            }
            return context.state.enqueueWrite(async () => {
                const created: ThreadRecord = {
                    thread_id: randomUUID(),
                    author_user_id: author.user_id,
                    title: input.title,
                    body: input.body,
                    created_at: new Date().toISOString(),
                };
                await appendJsonlRecord(context.data, THREADS_FILE, ThreadRecord, created);
                context.log.info("Created thread", {thread_id: created.thread_id, author_user_id: created.author_user_id});
                return created;
            });
        },
        async listThreads(context) {
            const threads = await readJsonlRecords(context.data, THREADS_FILE, ThreadRecord);
            // Reverse before sorting so threads appended in the same millisecond stay newest-first.
            return threads.reverse().sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at));
        },
        async getThread(context, input) {
            const threads = await readJsonlRecords(context.data, THREADS_FILE, ThreadRecord);
            return threads.find((thread) => thread.thread_id === input.thread_id) ?? null;
        },
    },
});

async function resolveAuthorNames(
    call: ComponentCallFn<readonly [typeof user_calls]>,
    author_ids: Iterable<string>,
): Promise<Map<string, string>> {
    const unique_ids = [...new Set(author_ids)];
    const entries = await Promise.all(unique_ids.map(async (user_id): Promise<readonly [string, string]> => {
        const user = await call(user_calls.calls.getUser, {user_id});
        return [user_id, user?.display_name ?? user_id];
    }));
    return new Map(entries);
}

const ThreadIdParams = type({thread_id: NonEmptyString});
const CreateThreadBody = type({title: TrimmedNonEmptyString, body: NonBlankString});
type ThreadRouteUses = readonly [typeof thread_calls, typeof comment_calls, typeof user_calls];

export const thread_routes = defineFastifyRoutes({
    uses: [thread_calls, comment_calls, user_calls],
    routes: [
        {
            method: "GET",
            path: "/",
            async handle(context: GatewayHandlerContext<ThreadRouteUses, WebConfig>) {
                const threads = await context.call(thread_calls.calls.listThreads, {});
                const authors = await resolveAuthorNames(context.call, threads.map((thread) => thread.author_user_id));
                const list_html = threads.length === 0
                    ? "<p>No threads yet.</p>"
                    : [
                            "<ul>",
                            ...threads.map((thread) => {
                                const author = escapeHtml(authors.get(thread.author_user_id) ?? thread.author_user_id);
                                return `<li data-thread-id="${escapeHtml(thread.thread_id)}"><a href="/threads/${encodeURIComponent(thread.thread_id)}">${escapeHtml(thread.title)}</a> by ${author} (${escapeHtml(thread.created_at)})</li>`;
                            }),
                            "</ul>",
                        ].join("\n");
                context.html(renderPage({
                    site_title: context.getConfig().site_title,
                    page_title: "Threads",
                    user: context.request.user ?? null,
                    content: `<h1>Threads</h1>\n${list_html}`,
                }));
            },
        },
        {
            method: "GET",
            path: "/threads/new",
            preValidation: requireAuthenticated,
            handle(context: GatewayHandlerContext<ThreadRouteUses, WebConfig>) {
                const content = [
                    "<h1>New thread</h1>",
                    `<form method="post" action="/threads">`,
                    `<label>Title <input type="text" name="title" required></label>`,
                    `<label>Body <textarea name="body" required></textarea></label>`,
                    `<button type="submit">Create thread</button>`,
                    "</form>",
                ].join("\n");
                context.html(renderPage({
                    site_title: context.getConfig().site_title,
                    page_title: "New thread",
                    user: context.request.user ?? null,
                    content,
                }));
            },
        },
        defineFastifyRoute<ThreadRouteUses, WebConfig, typeof ThreadIdParams>({
            method: "GET",
            path: "/threads/:thread_id",
            params: ThreadIdParams,
            async handle(context) {
                const thread = await context.call(thread_calls.calls.getThread, {thread_id: context.params.thread_id});
                if(thread == null) {
                    throw new NotFoundError("Thread not found.");
                }
                const comments = await context.call(comment_calls.calls.listCommentsByThread, {thread_id: thread.thread_id});
                const authors = await resolveAuthorNames(context.call, [
                    thread.author_user_id,
                    ...comments.map((comment) => comment.author_user_id),
                ]);
                const user = context.request.user ?? null;
                const thread_author = escapeHtml(authors.get(thread.author_user_id) ?? thread.author_user_id);
                const comments_html = comments.length === 0
                    ? "<p>No comments yet.</p>"
                    : [
                            "<ol>",
                            ...comments.map((comment) => {
                                const author = escapeHtml(authors.get(comment.author_user_id) ?? comment.author_user_id);
                                return `<li data-comment-id="${escapeHtml(comment.comment_id)}"><p>${escapeHtml(comment.body)}</p><small>${author} (${escapeHtml(comment.created_at)})</small></li>`;
                            }),
                            "</ol>",
                        ].join("\n");
                const comment_form = user == null
                    ? `<p><a href="/login">Log in</a> to post a comment.</p>`
                    : [
                            `<form method="post" action="/threads/${encodeURIComponent(thread.thread_id)}/comments">`,
                            `<label>Comment <textarea name="body" required></textarea></label>`,
                            `<button type="submit">Post comment</button>`,
                            "</form>",
                        ].join("\n");
                const content = [
                    `<article data-thread-id="${escapeHtml(thread.thread_id)}">`,
                    `<h1>${escapeHtml(thread.title)}</h1>`,
                    `<p>${escapeHtml(thread.body)}</p>`,
                    `<small>By ${thread_author} (${escapeHtml(thread.created_at)})</small>`,
                    "</article>",
                    "<section>",
                    "<h2>Comments</h2>",
                    comments_html,
                    comment_form,
                    "</section>",
                ].join("\n");
                context.html(renderPage({
                    site_title: context.getConfig().site_title,
                    page_title: thread.title,
                    user,
                    content,
                }));
            },
        }),
        defineFastifyRoute({
            method: "POST",
            path: "/threads",
            preValidation: requireAuthenticated,
            body: CreateThreadBody,
            async handle(context) {
                const user = context.request.user ?? null;
                if(user == null) {
                    context.reply.code(401).send("Authentication required.");
                    return;
                }
                const created = await context.call(thread_calls.calls.createThread, {
                    author_user_id: user.user_id,
                    title: context.body.title,
                    body: context.body.body,
                });
                context.redirect(`/threads/${encodeURIComponent(created.thread_id)}`);
            },
        }),
    ],
});
