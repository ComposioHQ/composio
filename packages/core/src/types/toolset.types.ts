import { Tool } from "./tool.types";
import { Composio } from "../composio";

export interface Toolset<TTool> {
    _wrapTool(tool: Tool): TTool;
    setClient(client: Composio<Toolset<TTool>>): void;
}

export type WrappedTool<T> = T extends Toolset<infer U> ? U : never; 