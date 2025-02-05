//@ts-ignore
import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
    client: "@hey-api/client-axios",
    input: "https://backend.composio.dev/openapi.json",
    output: "src/sdk/client",
    services: {
        asClass: true,
        //@ts-ignore
        methodNameBuilder: (operation) => {
            const name = operation?.name?.split("Controller")[1] || operation?.name;
            //@ts-ignore
            return name?.charAt(0)?.toLowerCase() + name?.slice(1);
        },
        
    },
});
