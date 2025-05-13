import type { Toolset } from '../types/toolset.types';
import type { Tool, ToolListParams } from '../types/tool.types';
import type { Composio } from '../composio';
import { ModifiersParams, SchemaModifiersParams } from '../types/modifiers.types';

/**
 * Base class for non-agentic toolsets that only support schema modifiers
 * This is used for toolsets that don't need to handle tool execution modifiers
 * eg: OpenAI, Anthropic, etc.
 */
export abstract class BaseNonAgenticToolset<TToolCollection, TTool>
  implements Toolset<TTool, TToolCollection>
{
  protected composio: Composio<BaseComposioToolset<TToolCollection, TTool>> | undefined;
  protected DEFAULT_ENTITY_ID = 'default';

  setComposio(composio: Composio<BaseComposioToolset<TToolCollection, TTool>>): void {
    this.composio = composio;
  }

  abstract getTools(
    params?: ToolListParams,
    modifiers?: SchemaModifiersParams
  ): Promise<TToolCollection>;

  abstract getToolBySlug(slug: string, modifiers?: SchemaModifiersParams): Promise<TTool>;

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

/**
 * Base class for agentic toolsets that support full modifier capabilities
 * This is used for toolsets that need to handle tool execution modifiers
 * eg: Vercel, Langchain, etc.
 */
export abstract class BaseAgenticToolset<TToolCollection, TTool>
  implements Toolset<TTool, TToolCollection>
{
  protected composio: Composio<BaseComposioToolset<TToolCollection, TTool>> | undefined;
  protected DEFAULT_ENTITY_ID = 'default';

  setComposio(composio: Composio<BaseComposioToolset<TToolCollection, TTool>>): void {
    this.composio = composio;
  }

  abstract getTools(params?: ToolListParams, modifiers?: ModifiersParams): Promise<TToolCollection>;

  abstract getToolBySlug(slug: string, modifiers?: ModifiersParams): Promise<TTool>;

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

// Type for backward compatibility and type constraints
export type BaseComposioToolset<TToolCollection, TTool> =
  | BaseNonAgenticToolset<TToolCollection, TTool>
  | BaseAgenticToolset<TToolCollection, TTool>;
