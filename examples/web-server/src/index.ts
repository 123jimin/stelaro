// API design sketch: these packages and APIs intentionally do not exist yet.
import {defineApplication, defineComponent} from "peranto";
import {defineFastifyGateway} from "peranto-fastify";

const counter = defineComponent({
    id: "counter",
    state: () => ({
        count: 0,
    }),
    calls: {
        current: {
            input: {},
            output: {
                count: "number",
            },
            async handle({state}) {
                return {
                    count: state.count,
                };
            },
        },
        increment: {
            input: {},
            output: {
                count: "number",
            },
            async handle({state}) {
                state.count += 1;

                return {
                    count: state.count,
                };
            },
        },
    },
});

const http = defineFastifyGateway({
    id: "http",
    routes: [
        {
            method: "GET",
            path: "/",
            async handle({call, html}) {
                const {count: currentCount} = await call("counter.current", {});

                return html`
                    <main>
                        <p>Count: ${currentCount}</p>
                        <form method="post" action="/counter/increment">
                            <button type="submit">Increase</button>
                        </form>
                    </main>
                `;
            },
        },
        {
            method: "POST",
            path: "/counter/increment",
            async handle({call, redirect}) {
                await call("counter.increment", {});

                return redirect("/");
            },
        },
    ],
});

const app = defineApplication({
    components: [
        counter,
        http,
    ],
});

await app.listen({
    gateway: "http",
    port: 3000,
});
