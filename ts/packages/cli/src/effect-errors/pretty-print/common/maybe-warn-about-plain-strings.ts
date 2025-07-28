import color from 'picocolors';

export const maybeWarnAboutPlainStrings = (isPlainString: boolean): string[] => {
  if (!isPlainString) {
    return [];
  }

  return [
    '',
    color.gray(
      'ℹ️  You used a plain string to represent a failure in the error channel (E). You should consider using tagged objects (with a _tag field), or yieldable errors such as Data.TaggedError and Schema.TaggedError for better handling experience.'
    ),
  ];
};
