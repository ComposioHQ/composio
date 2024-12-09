/*
    ComposioContext class provides a global context for storing SDK configuration.
    This singleton class maintains essential SDK settings like API key and base URL.
    It is used to store the API key and base URL in a global context so that it can be accessed by other modules without having to pass the configuration around.

    Warning: Can cause problems if there are multiple instances of the SDK running in the same process.
*/
class ComposioSDKContext {
    static apiKey: string;
    static baseURL: string; 
    static frameworkRuntime?: string;
    static source?: string = "javascript";
    static composioVersion?: string;
}

export default ComposioSDKContext;