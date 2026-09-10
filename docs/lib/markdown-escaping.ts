export function encodeMarkdownTableCell(value: string): string {
  return value.replace(/\r\n?|\n/g, ' ').replace(/\|/g, '&#124;');
}

export function encodeYamlString(value: string): string {
  return JSON.stringify(value);
}
