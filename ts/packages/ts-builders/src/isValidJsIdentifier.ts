import { isIdentifierName } from '@babel/helper-validator-identifier';

export function isValidJsIdentifier(name: string): boolean {
  return isIdentifierName(name);
}
