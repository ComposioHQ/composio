const composio = require("../dist/bundle");

const client = new composio.Composio(process.env.COMPOSIO_API_KEY);

(async() => {
    console.log(await client.apps.list());
})();
