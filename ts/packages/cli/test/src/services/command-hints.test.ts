import { describe, expect, it } from 'vitest';
import { Record } from 'effect';
import {
  COMMAND_HINTS,
  commandHintExample,
  commandHintLinks,
  renderCommandHintGraph,
} from 'src/services/command-hints';

describe('command-hints', () => {
  it('has no dangling linked command ids', () => {
    const ids = new Set(Record.keys(COMMAND_HINTS));

    for (const id of ids) {
      for (const linkedId of commandHintLinks(id)) {
        expect(ids.has(linkedId)).toBe(true);
      }
    }
  });

  it('renders examples from the registry', () => {
    expect(commandHintExample('root.tools.list')).toContain('composio tools list');
    expect(commandHintExample('root.triggers.list')).toContain('composio triggers list');
    expect(commandHintExample('root.triggers.info', { slug: 'GMAIL_NEW_GMAIL_MESSAGE' })).toContain(
      'GMAIL_NEW_GMAIL_MESSAGE'
    );
    expect(commandHintExample('root.execute', { slug: 'GMAIL_SEND_EMAIL' })).toContain(
      'GMAIL_SEND_EMAIL'
    );
    expect(commandHintExample('root.execute.getSchema', { slug: 'GMAIL_SEND_EMAIL' })).toContain(
      '--get-schema'
    );
    expect(commandHintExample('dev.logs.tools', { logId: 'log_123' })).toContain('log_123');
    expect(commandHintExample('root.search')).toBe('composio search "<query>"');
    expect(commandHintExample('root.search', { query: 'send email' })).toBe(
      'composio search "send email"'
    );
    expect(commandHintExample('root.search', { toolkits: 'custom_grain' })).toBe(
      'composio search "<query>" --toolkits custom_grain'
    );
  });

  it('serializes the graph with nodes and links', () => {
    const graph = renderCommandHintGraph();
    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(graph.nodes.find(node => node.id === 'root.execute')).toMatchObject({
      id: 'root.execute',
    });
  });
});
