import {randomUUID} from "node:crypto";

import {defineComponent, defineComponentCalls} from "@jiminp/stelaro";
import {type} from "arktype";

import {
    appendJsonlRecord, createWriteQueue, IsoTimestamp, NonEmptyString, readJsonlRecords, TrimmedNonEmptyString,
} from "./storage.ts";

const USERS_FILE = "users.jsonl";

export const AuthProvider = type("'google' | 'discord' | 'id'");
export type AuthProvider = typeof AuthProvider.infer;

export const UserRecord = type({
    "+": "reject",
    "user_id": NonEmptyString,
    "provider": AuthProvider,
    "provider_account_id": NonEmptyString,
    "display_name": NonEmptyString,
    "created_at": IsoTimestamp,
});
export type UserRecord = typeof UserRecord.infer;

export const user_calls = defineComponentCalls("users", {
    resolveUser: {
        input: type({
            provider: AuthProvider,
            provider_account_id: TrimmedNonEmptyString,
            display_name: TrimmedNonEmptyString,
        }),
        output: UserRecord,
    },
    getUser: {
        input: type({user_id: NonEmptyString}),
        output: UserRecord.or("null"),
    },
});

export const users_component = defineComponent({
    calls: user_calls,
    uses: [],
    state: () => ({enqueueWrite: createWriteQueue()}),
    handlers: {
        resolveUser(context, input) {
            return context.state.enqueueWrite(async () => {
                const users = await readJsonlRecords(context.data, USERS_FILE, UserRecord);
                const existing = users.find(
                    (user) => user.provider === input.provider && user.provider_account_id === input.provider_account_id,
                );
                if(existing != null) {
                    return existing;
                }
                const created: UserRecord = {
                    user_id: randomUUID(),
                    provider: input.provider,
                    provider_account_id: input.provider_account_id,
                    display_name: input.display_name,
                    created_at: new Date().toISOString(),
                };
                await appendJsonlRecord(context.data, USERS_FILE, UserRecord, created);
                context.log.info("Created user", {user_id: created.user_id, provider: created.provider});
                return created;
            });
        },
        async getUser(context, input) {
            const users = await readJsonlRecords(context.data, USERS_FILE, UserRecord);
            return users.find((user) => user.user_id === input.user_id) ?? null;
        },
    },
});
