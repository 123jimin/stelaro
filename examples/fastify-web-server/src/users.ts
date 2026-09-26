import {defineComponent, defineComponentCalls} from "@jiminp/stelaro";
import {type as schema} from "arktype";

import {appendJsonl, readJsonl} from "./storage.ts";

const DATA_PATH = "users.jsonl";

const ProviderSchema = schema("'google' | 'discord' | 'id'");

const UserSchema = schema({
    user_id: "string",
    provider: ProviderSchema,
    provider_account_id: "string",
    display_name: "string",
    created_at: "string",
});

type UserRecord = typeof UserSchema.infer;

export const UsersCalls = defineComponentCalls("users", {
    resolve: {
        input: schema({
            provider: ProviderSchema,
            provider_account_id: "string",
            display_name: "string",
        }),
        output: UserSchema,
    },
});

export const UsersComponent = defineComponent({
    calls: UsersCalls,
    uses: [],
    handlers: {
        resolve: {
            async handle(context, input) {
                const users = await readJsonl(context.data, DATA_PATH, UserSchema);
                const existing = users.find(
                    (u) => u.provider === input.provider
                        && u.provider_account_id === input.provider_account_id,
                );
                if(existing != null) {
                    return existing;
                }
                const record: UserRecord = {
                    user_id: crypto.randomUUID(),
                    provider: input.provider,
                    provider_account_id: input.provider_account_id,
                    display_name: input.display_name,
                    created_at: new Date().toISOString(),
                };
                await appendJsonl(context.data, DATA_PATH, record);
                context.log.info(
                    {event: "user.created", user_id: record.user_id, provider: record.provider},
                    "User created.",
                );
                return record;
            },
        },
    },
});
