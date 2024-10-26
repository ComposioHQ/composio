import { Composio } from "./index";

async function main() {
    const composio = new Composio()

    const entity = await composio.getEntity("default");
    console.log(entity);

    await new Promise(resolve => setTimeout(resolve, 10000));
}

main();