const HTML_ESCAPES: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
};

export class Markup {
    readonly html: string;

    constructor(html: string) {
        this.html = html;
    }
}

export type MarkupValue = Markup | string | number | readonly MarkupValue[];

function renderValue(value: MarkupValue): string {
    if(value instanceof Markup) return value.html;
    if(typeof value === "string" || typeof value === "number") {
        return String(value).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
    }
    return value.map(renderValue).join("");
}

/** Builds HTML from a template, escaping every interpolated value except nested {@link Markup}. */
export function markup(strings: TemplateStringsArray, ...values: MarkupValue[]): Markup {
    let html = strings[0] ?? "";
    for(const [i, value] of values.entries()) {
        html += renderValue(value) + (strings[i + 1] ?? "");
    }
    return new Markup(html);
}

export const THREAD_NOT_FOUND_HTML = `<h1>Thread not found</h1><nav><a href="/">Back</a></nav>`;
