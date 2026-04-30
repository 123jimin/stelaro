// API design sketch: these packages and APIs intentionally do not exist yet.
import {type as schema} from "arktype";
import {createApplication, defineComponent, defineComponentCalls} from "peranto";
import {defineFastifyGateway} from "peranto-fastify";

const CounterCalls = defineComponentCalls({
    id: "counter",
    calls: {
        current: {
            input: schema({}),
            output: schema({
                count: "number",
            }),
        },
        increment: {
            input: schema({}),
            output: schema({
                count: "number",
            }),
        },
        set: {
            input: schema({
                count: "number",
            }),
            output: schema({
                count: "number",
            }),
        },
    },
});

const counter = defineComponent({
    calls: CounterCalls,
    uses: [],
    state: () => ({
        count: 0,
    }),
    handlers: {
        current: {
            async handle({state}) {
                return {
                    count: state.count,
                };
            },
        },
        increment: {
            async handle({logger, state}) {
                state.count += 1;
                logger.info("counter.incremented", {
                    count: state.count,
                });

                return {
                    count: state.count,
                };
            },
        },
        set: {
            async handle({logger, state}, input) {
                state.count = input.count;
                logger.info("counter.set", {
                    count: state.count,
                });

                return {
                    count: state.count,
                };
            },
        },
    },
});

const http = defineFastifyGateway({
    id: "http",
    uses: [CounterCalls],
    routes: [
        {
            method: "GET",
            path: "/",
            async handle({call, html}) {
                const {count: currentCount} = await call(CounterCalls.calls.current, {});

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
                await call(CounterCalls.calls.increment, {});

                return redirect("/");
            },
        },
        {
            method: "POST",
            path: "/counter",
            body: schema({
                count: "number",
            }),
            async handle({body, call}) {
                return call(CounterCalls.calls.set, {
                    count: body.count,
                });
            },
        },
    ],
});

const app = createApplication({
    components: [
        counter,
        http,
    ],
});

await app.listen({
    gateway: "http",
    port: 3000,
});
