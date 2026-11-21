# @jiminp/stelaro-i18n

ICU MessageFormat localization for Stelaro applications and browsers.
Write messages where they are used, extract them offline with `@formatjs/cli`, and load per-locale string catalogs at runtime.

## Installation

Install the runtime package:

```sh
pnpm add @jiminp/stelaro-i18n
```

To extract messages from source files during development, install the FormatJS CLI as a dev dependency:

```sh
pnpm add -D @formatjs/cli
```

Extraction runs offline and is never bundled into `@jiminp/stelaro-i18n` or required at runtime.

## Authoring messages

Keep message descriptors next to the code that renders or formats them, and include `description` for translator context.

In UI components (such as React/TSX), use a bound translator (`i18n.bind(locale)`) and pass descriptors directly to `t`:

```tsx
// src/SettingsButton.tsx
import type {BoundI18n} from "@jiminp/stelaro-i18n";

export function SettingsButton({i18n, onOpen}: {i18n: BoundI18n; onOpen: () => void}) {
    const {t} = i18n;
    return (
        <button type="button" onClick={onOpen}>
            {t({
                defaultMessage: "Open settings",
                description: "Button that opens the settings panel",
            })}
        </button>
    );
}
```

When using the locale-first form `i18n.t(locale, descriptor)`, declare descriptors with `defineMessages`:

```ts
// src/sign-in.ts
import {defineMessages, type I18n, type Locale} from "@jiminp/stelaro-i18n";

const messages = defineMessages({
    greeting: {
        id: "greeting",
        defaultMessage: "Hello, {name}!",
        description: "Greeting shown after sign-in",
    },
    welcome: {
        id: "welcome",
        defaultMessage: "Welcome!",
        description: "Greeting after sign-in when the user has no display name",
    },
});

export function signInGreeting(i18n: I18n, locale: Locale, display_name: string | null) {
    if (display_name == null) return i18n.t(locale, messages.welcome);
    return i18n.t(locale, messages.greeting, {name: display_name});
}
```

`defineMessages` preserves literal descriptor types so `t` checks simple `{placeholder}` names at compile time.
Use explicit `id`s when you want keys decoupled from source text, or when identical source text needs distinct translations in different contexts.

## Extracting messages

Run `@formatjs/cli extract` against your TypeScript and TSX source files:

```sh
pnpm exec formatjs extract "src/**/*.{ts,tsx}" \
  --additional-function-names t \
  --id-interpolation-pattern 'auto:[sha512:contenthash:base64:6]' \
  --preserve-whitespace \
  --throws \
  --out-file source.json
```

- `@formatjs/cli` reads `.ts` and `.tsx` directly; no Babel or SWC transform is required.
- `--additional-function-names t` extracts descriptor-first bound calls (`t(descriptor)` and `bound.t(descriptor)`).
- Locale-first calls (`i18n.t(locale, descriptor)`) are not extractable because the descriptor is the second argument, not the first; declare those descriptors with `defineMessages`.

The generated `source.json` maps message keys to `{defaultMessage, description}` for translators:

```json
{
  "auto:Rw7t5q": {
    "defaultMessage": "Open settings",
    "description": "Button that opens the settings panel"
  },
  "greeting": {
    "defaultMessage": "Hello, {name}!",
    "description": "Greeting shown after sign-in"
  },
  "welcome": {
    "defaultMessage": "Welcome!",
    "description": "Greeting after sign-in when the user has no display name"
  }
}
```

## Building runtime catalogs

At runtime, `@jiminp/stelaro-i18n` looks up each descriptor by its explicit `id`, or by its exact `defaultMessage` when `id` is omitted (`catalogKey`).
`description` is translator context only and is never part of the key.

Each locale catalog is a JSON object mapping runtime keys to translated strings only (`Record<string, string>`), stored at `{catalog_dir}/{locale}.json` (default: `i18n/{locale}.json`).

When translators return strings keyed by the extracted IDs (for example, `fr.translated.json`):

```json
{
  "auto:Rw7t5q": "Ouvrir les paramètres",
  "greeting": "Bonjour, {name} !",
  "welcome": "Bienvenue !"
}
```

Remap generated IDs back to `defaultMessage` when building `i18n/fr.json`:

```js
// scripts/merge-catalog.mjs
import {mkdir, readFile, writeFile} from "node:fs/promises";

const source = JSON.parse(await readFile("source.json", "utf8"));
const translated = JSON.parse(await readFile("fr.translated.json", "utf8"));
const catalog = {};

for (const [extracted_key, value] of Object.entries(translated)) {
    const entry = source[extracted_key];
    if (entry == null) continue;
    if (typeof value !== "string") {
        throw new TypeError(`Expected string translation for "${extracted_key}".`);
    }
    const runtime_key = extracted_key.startsWith("auto:") ? entry.defaultMessage : extracted_key;
    if (Object.hasOwn(catalog, runtime_key)) {
        throw new Error(`Duplicate runtime key: ${runtime_key}`);
    }
    catalog[runtime_key] = value;
}

await mkdir("i18n", {recursive: true});
await writeFile("i18n/fr.json", `${JSON.stringify(catalog, null, 2)}\n`);
```

```sh
node scripts/merge-catalog.mjs
```

This writes `i18n/fr.json` with runtime keys and translated strings only:

```json
{
  "Open settings": "Ouvrir les paramètres",
  "greeting": "Bonjour, {name} !",
  "welcome": "Bienvenue !"
}
```

Runtime `Catalog` values must be plain strings; precompiled AST catalogs from `formatjs compile --ast` are outside the current contract.
Translation tools often treat ICU syntax as opaque, so accepting translations without ICU validation can defer malformed-message errors until runtime.

## Loading catalogs at runtime

`createI18n` creates a localization holder synchronously with optional in-memory `messages` seeds.
`i18n.load(read, log?)` requests `{catalog_dir}/{locale}.json` for each configured locale through a caller-supplied reader that returns parsed JSON, or `null` when absent.

### In a Stelaro component

Hold the `I18n` instance in component state and load catalogs from component data in `start`:

```ts
import {defineComponent, defineComponentCalls, defineLocalOutput} from "@jiminp/stelaro";
import {createI18n} from "@jiminp/stelaro-i18n";
import {type} from "arktype";
import {signInGreeting} from "./sign-in.ts";

const calls = defineComponentCalls("greetings", {
    greet: {
        input: type({locale: "string", display_name: "string | null"}),
        output: defineLocalOutput<string>(),
    },
});

export const greetings = defineComponent({
    calls,
    uses: [],
    state: () => createI18n({default_locale: "en", locales: ["en", "fr"]}),
    start({state, data, log}) {
        return state.load((path) => data.read(path).optional().json(), log);
    },
    handlers: {
        greet: ({state}, input) => signInGreeting(state, input.locale, input.display_name),
    },
});
```

### In a browser

Load catalogs with `fetch` and pass a bound translator to UI components:

```tsx
import {createI18n} from "@jiminp/stelaro-i18n";
import {SettingsButton} from "./SettingsButton.tsx";

const i18n = createI18n({
    default_locale: "en",
    locales: ["fr"],
    messages: {
        fr: {greeting: "Salut, {name} !"},
    },
});

await i18n.load(async (path) => {
    const response = await fetch(`/${path}`);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Failed to load ${path}: ${response.status}`);
    return response.json();
});

const fr = i18n.bind("fr");
// <SettingsButton i18n={fr} onOpen={openSettings} />
```

### Seeding, overlay, and fallback

- **Seeds**: `messages` passed to `createI18n` are available immediately before `load` runs, including for locales not listed in `locales`.
- **Overlay**: Loaded entries override matching seeded keys for that locale, while seed-only entries survive.
- **Fallback**: `t` formats the locale's translation, then falls back to formatting `defaultMessage` in `default_locale`, and finally returns the literal catalog key if `defaultMessage` is empty or fails to format.
- **Errors**: Malformed ICU syntax and missing interpolation values are logged to the `log` passed to `load` (or `console.error` by default) without throwing; missing translations fall back silently.
