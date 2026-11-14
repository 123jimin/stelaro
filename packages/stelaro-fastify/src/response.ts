import type {FastifyReply} from "fastify";

/**
 * The media type of UTF-8 HTML responses.
 *
 * @category Gateway
 */
export const HTML_MEDIA_TYPE = "text/html; charset=utf-8";

/**
 * The media type of UTF-8 JSON responses.
 *
 * @category Gateway
 */
export const JSON_MEDIA_TYPE = "application/json; charset=utf-8";

/**
 * Send HTML content typed as {@link HTML_MEDIA_TYPE}.
 *
 * @param reply - Fastify reply to send
 * @param content - HTML content
 * @returns The sent reply
 *
 * @category Gateway
 */
export function sendHtml(reply: FastifyReply, content: string): FastifyReply {
    return reply.type(HTML_MEDIA_TYPE).send(content);
}
