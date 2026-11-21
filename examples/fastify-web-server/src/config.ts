import {type} from "arktype";

export const WebConfig = type({
    "+": "reject",
    "site_title": "string > 0",
});
export type WebConfig = typeof WebConfig.infer;
