import { Composio } from "../types";

(async () => {
    const client = new Composio(process.env.COMPOSIO_API_KEY);
    console.log(await client.apps.list());
})();