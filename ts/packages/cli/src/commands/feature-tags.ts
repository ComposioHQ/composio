export type CliFeatureTag = string;
export type HelpLevel = 'simple' | 'default' | 'full';

export type TaggedValue<T> = {
  readonly value: T;
  readonly tags?: ReadonlyArray<CliFeatureTag>;
  readonly helpLevel?: HelpLevel;
};

export type CommandVisibility = {
  readonly isDevModeEnabled: boolean;
  readonly isExperimentalFeatureEnabled: (feature: string) => boolean;
};

export const tagged = <T>(value: T, tags?: ReadonlyArray<CliFeatureTag>): TaggedValue<T> => ({
  value,
  tags,
});

export const simple = <T>(value: T, tags?: ReadonlyArray<CliFeatureTag>): TaggedValue<T> => ({
  value,
  tags,
  helpLevel: 'simple',
});

export const full = <T>(value: T, tags?: ReadonlyArray<CliFeatureTag>): TaggedValue<T> => ({
  value,
  tags,
  helpLevel: 'full',
});

export const experimental = <T>(feature: string, value: T): TaggedValue<T> => ({
  value,
  tags: [feature],
});

const HELP_LEVEL_ORDER: Record<HelpLevel, number> = {
  simple: 0,
  default: 1,
  full: 2,
};

export const isTaggedValueVisibleForHelpLevel = <T>(
  entry: TaggedValue<T>,
  helpLevel: HelpLevel = 'default'
): boolean => HELP_LEVEL_ORDER[helpLevel] >= HELP_LEVEL_ORDER[entry.helpLevel ?? 'default'];

export const isTaggedValueVisible = <T>(
  entry: TaggedValue<T>,
  visibility: CommandVisibility
): boolean => {
  if (!entry.tags || entry.tags.length === 0) {
    return true;
  }

  return entry.tags.every(tag => visibility.isExperimentalFeatureEnabled(tag));
};

export const visibleValues = <T>(
  entries: ReadonlyArray<TaggedValue<T>>,
  visibility: CommandVisibility,
  helpLevel: HelpLevel = 'default'
): Array<T> =>
  entries
    .filter(
      entry =>
        isTaggedValueVisible(entry, visibility) &&
        isTaggedValueVisibleForHelpLevel(entry, helpLevel)
    )
    .map(entry => entry.value);
