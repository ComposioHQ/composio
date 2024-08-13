import apiClient from "../client/client"

export class User{
    public static apiKey: string;
    public static baseUrl: string;

    public static async getClientId(): Promise<string> {
        const response = await apiClient.clientAuthService.getUserInfo();
        if (response.status !== 200) {
            throw new Error(`HTTP Error: ${response.status}`);
        }
        return (response.data as unknown as Record<string, Record<string, string>>).client.id;
    }
}