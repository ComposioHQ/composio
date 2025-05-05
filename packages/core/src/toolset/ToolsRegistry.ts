import { Tool, ToolSchema } from '../types/tool.types';

/**
 * TOOLS REGISTRY
 *
 * This singlton class is used to register user provided tools in the toolset.
 *
 *
 */
export class ToolsRegistry {
  private tools: Map<string, Tool> = new Map<string, Tool>();

  constructor() {}

  /**
   * Create a tool in the registry.
   * @param {Tool} tool - The tool to create.
   * @returns {Tool} The created tool.
   */
  createTool(tool: Tool): Tool {
    try {
      const parsedTool = ToolSchema.parse(tool);
      const lowerCaseSlug = parsedTool.slug.toLowerCase();
      this.tools.set(lowerCaseSlug, parsedTool);
      return parsedTool;
    } catch (error) {
      throw new Error(`Failed to create tool ${tool.slug}: ${error}`);
    }
  }

  /**
   * Get a tool from the registry.
   * @param {string} slug - The slug of the tool.
   * @returns {Tool | undefined} The tool.
   */
  getToolBySlug(slug: string): Tool | undefined {
    const lowerCaseSlug = slug.toLowerCase();
    return this.tools.get(lowerCaseSlug);
  }

  /**
   * Get all the tools from the registry.
   * @returns {Tool[]} The tools.
   */
  getTools(): Tool[] {
    return Array.from(this.tools.values());
  }
}

export const toolsRegistry = new ToolsRegistry();
