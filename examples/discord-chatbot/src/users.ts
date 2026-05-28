import {defineComponent, defineComponentCalls} from "@jiminp/stelaro";
import {type as schema} from "arktype";

import {appendJsonl, readJsonl} from "./storage.ts";

const DATA_PATH = "data/users.jsonl";

type UserRecord = {
    user_id: string;
    discord_user_id: string;
    display_name: string;
    created_at: string;
};

export const UsersCalls = defineComponentCalls("users", {
        resolve: {
            input: schema({
                discord_user_id: "string",
                display_name: "string",
            }),
            output: schema({
                user_id: "string",
                discord_user_id: "string",
                display_name: "string",
                created_at: "string",
            }),
        },
    });

export const UsersComponent = defineComponent({
    calls: UsersCalls,
    uses: [],
    handlers: {
        resolve: {
            async handle(_context, input) {
                const users = await readJsonl<UserRecord>(DATA_PATH);
                const existing = users.find(
                    (u) => u.discord_user_id === input.discord_user_id,
                );
                if(existing != null) {
                    return existing;
                }
                const record: UserRecord = {
                    user_id: crypto.randomUUID(),
                    discord_user_id: input.discord_user_id,
                    display_name: input.display_name,
                    created_at: new Date().toISOString(),
                };
                await appendJsonl(DATA_PATH, record);
                return record;
            },
        },
    },
});
