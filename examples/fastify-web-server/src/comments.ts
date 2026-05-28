import {defineComponent, defineComponentCalls} from "@jiminp/stelaro";
import {defineFastifyRoutes, route} from "@jiminp/stelaro-fastify";
import {type as schema} from "arktype";

import {requireAuth} from "./auth.ts";
import {appendJsonl, readJsonl} from "./storage.ts";
import {UsersCalls} from "./users.ts";

const DATA_PATH = "data/comments.jsonl";

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
            output: CommentSchema,
        },
        list_by_thread: {
            input: schema({thread_id: "string"}),
            output: schema({
                comments: CommentSchema.array(),
            }),
        },
    });

export const CommentsComponent = defineComponent({
    calls: CommentsCalls,
    uses: [],
    handlers: {
        create: {
            async handle(_context, input) {
                const record: CommentRecord = {
                    comment_id: crypto.randomUUID(),
                    thread_id: input.thread_id,
                    author_user_id: input.author_user_id,
                    body: input.body,
                    created_at: new Date().toISOString(),
                };
                await appendJsonl(DATA_PATH, record);
                return record;
            },
        },
        list_by_thread: {
            async handle(_context, input) {
                const all_comments = await readJsonl<CommentRecord>(DATA_PATH);
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
        route({
            method: "POST",
            path: "/threads/:thread_id/comments",
            preHandler: [requireAuth],
            params: schema({thread_id: "string"}),
            body: schema({body: "string"}),
            async handle({request, params, body: form, call, redirect}) {
                if(request.user == null) return;
                const {user_id} = await call(UsersCalls.calls.resolve, {
                    provider: request.user.provider,
                    provider_account_id: request.user.provider_account_id,
                    display_name: request.user.display_name,
                });
                await call(CommentsCalls.calls.create, {
                    thread_id: params.thread_id,
                    author_user_id: user_id,
                    body: form.body,
                });
                return redirect(`/threads/${params.thread_id}`);
            },
        }),
    ],
});
