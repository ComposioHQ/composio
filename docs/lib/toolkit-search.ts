import type { IFuseOptions } from 'fuse.js';
import type { ToolkitSummary } from '@/types/toolkit';

/**
 * Pure search/grouping logic for the toolkits landing page.
 *
 * Kept framework-free (no React/`use client`) so it can be unit-tested
 * directly and shared between the landing component and the static tests.
 */

export type CategoryGroup =
  | 'Developer'
  | 'AI'
  | 'Sales & Marketing'
  | 'Business & Finance'
  | 'Productivity'
  | 'Communication'
  | 'Other';

export type GroupFilter = CategoryGroup | 'All';

/** Display order for the category pills. */
export const CATEGORY_GROUPS: CategoryGroup[] = [
  'Developer',
  'AI',
  'Sales & Marketing',
  'Business & Finance',
  'Productivity',
  'Communication',
  'Other',
];

/**
 * Curated mapping from the ~78 raw toolkit categories to a handful of
 * scannable super-groups (issue #3441). Any category not listed here — and
 * any null category — falls through to 'Other', so new categories are safe by
 * default and never break the filter.
 */
export const CATEGORY_TO_GROUP: Record<string, CategoryGroup> = {
  // Developer
  'developer tools': 'Developer',
  'ai web scraping': 'Developer',
  databases: 'Developer',
  'server monitoring': 'Developer',
  'security & identity tools': 'Developer',
  'it operations': 'Developer',
  'app builder': 'Developer',
  'website builders': 'Developer',
  'internet of things': 'Developer',
  'url shortener': 'Developer',
  // AI
  'artificial intelligence': 'AI',
  'ai chatbots': 'AI',
  'ai agents': 'AI',
  'ai models': 'AI',
  'ai document extraction': 'AI',
  'ai meeting assistants': 'AI',
  'ai sales tools': 'AI',
  'ai content generation': 'AI',
  'ai assistants': 'AI',
  'ai safety compliance detection': 'AI',
  // Sales & Marketing
  'marketing automation': 'Sales & Marketing',
  crm: 'Sales & Marketing',
  marketing: 'Sales & Marketing',
  'email newsletters': 'Sales & Marketing',
  'transactional email': 'Sales & Marketing',
  'drip emails': 'Sales & Marketing',
  'sales & crm': 'Sales & Marketing',
  'social media marketing': 'Sales & Marketing',
  'social media accounts': 'Sales & Marketing',
  'ads & conversion': 'Sales & Marketing',
  reviews: 'Sales & Marketing',
  // Business & Finance
  analytics: 'Business & Finance',
  'business intelligence': 'Business & Finance',
  accounting: 'Business & Finance',
  'payment processing': 'Business & Finance',
  ecommerce: 'Business & Finance',
  commerce: 'Business & Finance',
  'human resources': 'Business & Finance',
  'hr talent & recruitment': 'Business & Finance',
  signatures: 'Business & Finance',
  'proposal & invoice management': 'Business & Finance',
  taxes: 'Business & Finance',
  fundraising: 'Business & Finance',
  // Productivity
  productivity: 'Productivity',
  documents: 'Productivity',
  'project management': 'Productivity',
  'forms & surveys': 'Productivity',
  'scheduling & booking': 'Productivity',
  'time tracking software': 'Productivity',
  'task management': 'Productivity',
  'team collaboration': 'Productivity',
  notes: 'Productivity',
  'product management': 'Productivity',
  'contact management': 'Productivity',
  'file management & storage': 'Productivity',
  'content & files': 'Productivity',
  spreadsheets: 'Productivity',
  'images & design': 'Productivity',
  // Communication
  communication: 'Communication',
  'customer support': 'Communication',
  'phone & sms': 'Communication',
  'team chat': 'Communication',
  'video conferencing': 'Communication',
  notifications: 'Communication',
  webinars: 'Communication',
  'video & audio': 'Communication',
  transcription: 'Communication',
  email: 'Communication',
  fax: 'Communication',
};

/** Resolve a raw toolkit category to its curated super-group. */
export function groupForCategory(category: string | null): CategoryGroup {
  if (!category) return 'Other';
  return CATEGORY_TO_GROUP[category.trim().toLowerCase()] ?? 'Other';
}

/**
 * Fuse.js options for toolkit search. Name matches rank above slug matches;
 * threshold/distance are tuned to tolerate typos without surfacing junk.
 */
export const TOOLKIT_FUSE_OPTIONS: IFuseOptions<ToolkitSummary> = {
  keys: [
    { name: 'name', weight: 2 },
    { name: 'slug', weight: 1.5 },
  ],
  threshold: 0.4,
  distance: 200,
  minMatchCharLength: 1,
};
