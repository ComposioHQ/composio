import { describe, expect, it } from 'vitest';
import { createToolkitIndex } from 'src/generation/create-toolkit-index';
import { makeTestToolkits } from 'test/__utils__/models/toolkits';
import { TRIGGER_TYPE_GMAIL } from 'test/__mocks__/trigger-type-gmail';

describe('createToolkitIndex', () => {
  it('[Given] empty toolkits, tools, triggerTypes [Then] it returns an empty index', () => {
    const index = createToolkitIndex({
      toolkits: [],
      tools: [],
      triggerTypes: [],
    });

    expect(index).toEqual({});
  });

  it('[Given] only toolkits and no tools or triggerTypes [Then] it returns an index with empty tools and triggerTypes', () => {
    const toolkits = makeTestToolkits([
      {
        name: 'Gmail',
        slug: 'gmail',
      },
      {
        name: 'Slack Helper',
        slug: 'slack',
      },
    ]);

    const index = createToolkitIndex({
      toolkits,
      tools: [],
      triggerTypes: [],
    });

    expect(index).toEqual({
      GMAIL: {
        slug: 'gmail',
        tools: {},
        triggerTypes: {},
      },
      SLACK: {
        slug: 'slack',
        tools: {},
        triggerTypes: {},
      },
    });
  });

  it('[Given] valid toolkits, tools, triggerTypes [Then] it builds an index based on toolkits', () => {
    const toolkits = makeTestToolkits([
      {
        name: 'Gmail',
        slug: 'gmail',
      },
      {
        name: 'Slack Helper',
        slug: 'slack',
      },
    ]);

    const tools = ['GMAIL_CREATE_EMAIL_DRAFT', 'GMAIL_DELETE_MESSAGE', 'GMAIL_FETCH_EMAILS'];
    const triggerTypes = [TRIGGER_TYPE_GMAIL];

    const index = createToolkitIndex({
      toolkits,
      tools,
      triggerTypes,
    });

    expect(index).toEqual({
      GMAIL: {
        slug: 'gmail',
        tools: {
          CREATE_EMAIL_DRAFT: 'GMAIL_CREATE_EMAIL_DRAFT',
          DELETE_MESSAGE: 'GMAIL_DELETE_MESSAGE',
          FETCH_EMAILS: 'GMAIL_FETCH_EMAILS',
        },
        triggerTypes: {
          NEW_GMAIL_MESSAGE: TRIGGER_TYPE_GMAIL,
        },
      },
      SLACK: {
        slug: 'slack',
        tools: {},
        triggerTypes: {},
      },
    });
  });
});
