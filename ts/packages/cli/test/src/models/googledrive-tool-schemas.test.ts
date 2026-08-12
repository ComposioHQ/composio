import { describe, expect, it } from 'vitest';
import { TOOLS_TYPES_GOOGLEDRIVE } from 'test/__mocks__/tools-types-googledrive';

describe('Google Drive tool schemas', () => {
  it.each(['GOOGLEDRIVE_CREATE_FOLDER', 'GOOGLEDRIVE_CREATE_FILE_FROM_TEXT'])(
    'exposes a fields mask for %s',
    slug => {
      const tool = TOOLS_TYPES_GOOGLEDRIVE.find(item => item.slug === slug);

      expect(tool?.input_parameters).toMatchObject({
        properties: {
          fields: {
            nullable: true,
            type: 'string',
          },
        },
      });
    }
  );
});
