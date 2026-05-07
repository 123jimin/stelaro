import {defineComponent, defineComponentCalls} from "@jiminp/peranto";
import {type as schema} from "arktype";

import {appendJsonl, readJsonl} from "./storage.ts";

const DATA_PATH = "data/comments.jsonl";

const CommentSchema = schema({
    comment_id: "string",
    thread_id: "string",
    author_user_id: "string",
    body: "string",
    created_at: "string",
});

type CommentRecord = typeof CommentSchema.infer;

export const CommentsCalls = defineComponentCalls({
    id: "comments",
    calls: {
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
