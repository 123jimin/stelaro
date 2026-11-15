import type {FastifyReply} from "fastify";

/**
 * UTF-8 HTML `Content-Type` header value.
 *
 * @category Gateway
 */
export const HTML_MEDIA_TYPE = "text/html; charset=utf-8";

/**
 * UTF-8 JSON `Content-Type` header value.
 *
 * @category Gateway
 */
export const JSON_MEDIA_TYPE = "application/json; charset=utf-8";

/**
 * Send an HTML string with `Content-Type` set to {@link HTML_MEDIA_TYPE}.
 *
 * @param reply - Fastify reply
 * @param content - HTML markup
 * @returns The Fastify reply
 *
 * @category Gateway
 */
export function sendHtml(reply: FastifyReply, content: string): FastifyReply {
    return reply.type(HTML_MEDIA_TYPE).send(content);
}
