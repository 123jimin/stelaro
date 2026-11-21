import type {UserRecord} from "./users.ts";

const HTML_ESCAPE_MAP: Readonly<Record<string, string>> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
};

export function escapeHtml(value: string): string {
    return value.replaceAll(/[&<>"']/gu, (char) => HTML_ESCAPE_MAP[char] ?? char);
}

export type PageOptions = {
    readonly site_title: string;
    readonly page_title: string;
    readonly user: UserRecord | null;
    readonly content: string;
};

export function renderPage({site_title, page_title, user, content}: PageOptions): string {
    const escaped_site = escapeHtml(site_title);
    const escaped_title = escapeHtml(page_title);
    const auth_nav = user == null
        ? `<a href="/login">Log in</a>`
        : [
                `<span>Signed in as ${escapeHtml(user.display_name)}</span>`,
                `<a href="/threads/new">New thread</a>`,
                `<form method="post" action="/logout"><button type="submit">Log out</button></form>`,
            ].join(" ");

    return [
        "<!doctype html>",
        `<html lang="en">`,
        `<head><meta charset="utf-8"><title>${escaped_title} - ${escaped_site}</title></head>`,
        "<body>",
        `<header><a href="/">${escaped_site}</a><nav>${auth_nav}</nav></header>`,
        `<main>${content}</main>`,
        "</body>",
        "</html>",
    ].join("\n");
}
