import {defineComponent, defineComponentCalls} from "@jiminp/stelaro";
import {defineFastifyRoute, defineFastifyRoutes, sendHtml} from "@jiminp/stelaro-fastify";
import {type as schema} from "arktype";

import {requireAuth} from "./auth.ts";
import {THREAD_NOT_FOUND_HTML} from "./html.ts";
import {appendJsonl, readJsonl} from "./storage.ts";
import {ThreadsCalls} from "./threads-calls.ts";
import {UsersCalls} from "./users.ts";

const DATA_PATH = "comments.jsonl";

const CommentSchema = schema({
    comment_id: "string",
    thread_id: "string",
    author_user_id: "string",
    body: "string",
    created_at: "string",
});

type CommentRecord = typeof CommentSchema.infer;

export const CommentsCalls = defineComponentCalls("comments", {
    create: {
        input: schema({
            thread_id: "string",
            author_user_id: "string",
            body: "string",
        }),
        // null when the thread does not exist
        output: CommentSchema.or("null"),
    },
    listByThread: {
        input: schema({thread_id: "string"}),
        output: schema({
            comments: CommentSchema.array(),
        }),
    },
});

export const CommentsComponent = defineComponent({
    calls: CommentsCalls,
    uses: [ThreadsCalls],
    handlers: {
        create: {
            async handle(context, input) {
                const thread = await context.call(ThreadsCalls.calls.get, {thread_id: input.thread_id});
                if(thread == null) return null;
                const record: CommentRecord = {
                    comment_id: crypto.randomUUID(),
                    thread_id: thread.thread_id,
                    author_user_id: input.author_user_id,
                    body: input.body,
                    created_at: new Date().toISOString(),
                };
                await appendJsonl(context.data, DATA_PATH, record);
                context.log.info(
                    {event: "comment.created", comment_id: record.comment_id, thread_id: record.thread_id},
                    "Comment created.",
                );
                return record;
            },
        },
        listByThread: {
            async handle(context, input) {
                const all_comments = await readJsonl(context.data, DATA_PATH, CommentSchema);
                const comments = all_comments.filter((c) => c.thread_id === input.thread_id);
                comments.sort((a, b) => a.created_at.localeCompare(b.created_at));
                return {comments};
            },
        },
    },
});

export const CommentsRoutes = defineFastifyRoutes({
    uses: [CommentsCalls, UsersCalls],
    routes: [
        defineFastifyRoute({
            method: "POST",
            path: "/threads/:thread_id/comments",
            preHandler: [requireAuth],
            params: schema({thread_id: "string"}),
            body: schema({body: "string"}),
            async handle({request, reply, params, body: form, call, redirect}) {
                if(request.user == null) return;
                const {user_id} = await call(UsersCalls.calls.resolve, {
                    provider: request.user.provider,
                    provider_account_id: request.user.provider_account_id,
                    display_name: request.user.display_name,
                });
                const comment = await call(CommentsCalls.calls.create, {
                    thread_id: params.thread_id,
                    author_user_id: user_id,
                    body: form.body,
                });
                if(comment == null) {
                    sendHtml(reply.status(404), THREAD_NOT_FOUND_HTML);
                    return;
                }
                redirect(`/threads/${comment.thread_id}`);
            },
        }),
    ],
});
