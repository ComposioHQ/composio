import axios from "axios";

export class ComposioServer {
    static async getAction(actionName: string): Promise<any> {
        return axios.get(`https://tools-server.composio.dev/api/actions/${actionName}`).then((res) => res.data?.data).catch((err) => {
            return null;
        });
    }
}