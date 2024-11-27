import {Composio} from "./src/index"

async function main() {
    const composio = new Composio("u7ta9pbl3iz37qap6wdnk");

    const apps = await composio.apps.list();
    // console.log(apps);
}

main();