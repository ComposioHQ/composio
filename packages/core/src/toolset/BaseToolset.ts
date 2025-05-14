import type { Toolset } from '../types/toolset.types';
import type { Tool, ToolListParams } from '../types/tool.types';
import type { Composio } from '../composio';
import { AgenticToolOptions, ExecuteToolModifiers, ToolOptions } from '../types/modifiers.types';

// Type for backward compatibility and type constraints
export abstract class BaseNonAgenticToolset<TToolCollection, TTool> {
  protected composio: Composio<BaseComposioToolset<TToolCollection, TTool>> | undefined;

  setComposio(composio: Composio<BaseComposioToolset<TToolCollection, TTool>>): void {
    this.composio = composio;
  }

  abstract getTools(
    userId: string,
    params: ToolListParams,
    options?: ToolOptions
  ): Promise<TToolCollection>;

  abstract getToolBySlug(userId: string, slug: string, options?: ToolOptions): Promise<TTool>;

  abstract wrapTool(tool: Tool): TTool;

  protected getComposio(): Composio<BaseComposioToolset<TToolCollection, TTool>> {
    if (!this.composio) {
      throw new Error(
        'Client not initialized. Make sure the toolset is properly initialized with Composio.'
      );
    }
    return this.composio;
  }
}

export abstract class BaseAgenticToolset<TToolCollection, TTool> {
  protected composio: Composio<BaseComposioToolset<TToolCollection, TTool>> | undefined;

  setComposio(composio: Composio<BaseComposioToolset<TToolCollection, TTool>>): void {
    this.composio = composio;
  }

  abstract getToolBySlug(
    userId: string,
    slug: string,
    options?: AgenticToolOptions
  ): Promise<TTool>;

  abstract getTools(
    userId: string,
    params: ToolListParams,
    options?: AgenticToolOptions
  ): Promise<TToolCollection>;

  abstract wrapTool(userId: string, tool: Tool, modifers?: ExecuteToolModifiers): TTool;

  protected getComposio(): Composio<BaseComposioToolset<TToolCollection, TTool>> {
    if (!this.composio) {
      throw new Error(
        'Client not initialized. Make sure the toolset is properly initialized with Composio.'
      );
    }
    return this.composio;
  }
}

export type BaseComposioToolset<TToolCollection, TTool> =
  | BaseNonAgenticToolset<TToolCollection, TTool>
  | BaseAgenticToolset<TToolCollection, TTool>;

// export abstract class BaseComposioToolset<
//   TToolCollection,
//   TTool,
//   TToolOptions extends ToolOptions | AgenticToolOptions,
// > {
//   protected composio:
//     | Composio<BaseComposioToolset<TToolCollection, TTool, TToolOptions>>
//     | undefined;

//   setComposio(composio: Composio<BaseComposioToolset<TToolCollection, TTool, TToolOptions>>): void {
//     this.composio = composio;
//   }

//   abstract getTools(
//     userId: string,
//     params?: ToolListParams,
//     options?: TToolOptions
//   ): Promise<TToolCollection>;

//   abstract getToolBySlug(userId: string, slug: string, options?: TToolOptions): Promise<TTool>;

//   abstract wrapTool(userId: string, tool: Tool): TTool;

//   protected getComposio(): Composio<BaseComposioToolset<TToolCollection, TTool, TToolOptions>> {
//     if (!this.composio) {
//       throw new Error(
//         'Client not initialized. Make sure the toolset is properly initialized with Composio.'
//       );
//     }
//     return this.composio;
//   }
// }
