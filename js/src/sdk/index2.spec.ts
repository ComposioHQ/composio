import { getTestConfig } from "../../config/getTestConfig";
import { Composio } from "./index";

const { COMPOSIO_API_KEY, BACKEND_HERMES_URL } = getTestConfig();

describe("Entity spec suite", () => {
  it("should get an entity and then fetch a connection for a normal app", async () => {
    const app = "github";
    const composio = new Composio({
      apiKey: COMPOSIO_API_KEY,
      baseUrl: BACKEND_HERMES_URL,
    });
    const entity = composio.getEntity("default");

    expect(entity.id).toBe("default");

    const connection = await entity.getConnection({ app: app! });
    expect(connection?.appUniqueId).toBe(app);
  });
});
