/**
 * MDX to Markdown Converter
 *
 * Converts MDX content with JSX components to pure markdown
 * for AI agents that cannot parse JSX syntax.
 */

/**
 * Extract text content from between JSX tags
 */
function extractContent(jsx: string): string {
  // Remove self-closing tags
  let result = jsx.replace(/<[A-Z][^>]*\/>/g, '');

  // Remove opening and closing tags but keep content
  result = result.replace(/<\/?[A-Z][a-zA-Z]*[^>]*>/g, '');

  return result.trim();
}

/**
 * Convert <Tab> content to markdown section
 */
function convertTabToMarkdown(tabMatch: string): string {
  // Extract value attribute
  const valueMatch = tabMatch.match(/value="([^"]+)"/);
  const label = valueMatch ? valueMatch[1] : 'Option';

  // Extract content between <Tab> tags
  const contentMatch = tabMatch.match(/<Tab[^>]*>([\s\S]*?)<\/Tab>/);
  const content = contentMatch ? contentMatch[1].trim() : '';

  return `**${label}:**\n\n${content}`;
}

/**
 * Convert <Tabs> component to markdown sections
 */
function convertTabs(mdx: string): string {
  // Match <Tabs ...>...</Tabs> including nested content
  const tabsRegex = /<Tabs[^>]*>([\s\S]*?)<\/Tabs>/g;

  return mdx.replace(tabsRegex, (match, content) => {
    // Find all <Tab> elements
    const tabRegex = /<Tab[^>]*>[\s\S]*?<\/Tab>/g;
    const tabs = content.match(tabRegex) || [];

    if (tabs.length === 0) {
      return extractContent(content);
    }

    // Convert each tab to a markdown section
    const sections = tabs.map(convertTabToMarkdown);
    return sections.join('\n\n---\n\n');
  });
}

/**
 * Convert <Callout> component to blockquote
 */
function convertCallouts(mdx: string): string {
  // Match <Callout title="..." type="...">...</Callout>
  const calloutRegex = /<Callout[^>]*?(?:title="([^"]*)")?[^>]*?(?:type="([^"]*)")?[^>]*>([\s\S]*?)<\/Callout>/g;

  return mdx.replace(calloutRegex, (match, title, type, content) => {
    const prefix = title || type || 'Note';
    const cleanContent = extractContent(content).replace(/\n/g, '\n> ');
    return `> **${prefix}:** ${cleanContent}\n`;
  });
}

/**
 * Convert <Card> component to list item
 */
function convertCard(cardMatch: string): string {
  const titleMatch = cardMatch.match(/title="([^"]+)"/);
  const hrefMatch = cardMatch.match(/href="([^"]+)"/);
  const descMatch = cardMatch.match(/description="([^"]+)"/);

  const title = titleMatch ? titleMatch[1] : '';
  const href = hrefMatch ? hrefMatch[1] : '';
  const desc = descMatch ? descMatch[1] : '';

  if (href) {
    return `- [${title}](${href})${desc ? ` - ${desc}` : ''}`;
  }
  return `- **${title}**${desc ? `: ${desc}` : ''}`;
}

/**
 * Convert <Cards> component to bullet list
 */
function convertCards(mdx: string): string {
  const cardsRegex = /<Cards>([\s\S]*?)<\/Cards>/g;

  return mdx.replace(cardsRegex, (match, content) => {
    // Find all <Card> elements
    const cardRegex = /<Card[^>]*(?:\/>|>[\s\S]*?<\/Card>)/g;
    const cards = content.match(cardRegex) || [];

    if (cards.length === 0) {
      return extractContent(content);
    }

    return cards.map(convertCard).join('\n');
  });
}

/**
 * Convert <Steps> and <Step> to numbered list
 */
function convertSteps(mdx: string): string {
  const stepsRegex = /<Steps>([\s\S]*?)<\/Steps>/g;

  return mdx.replace(stepsRegex, (match, content) => {
    const stepRegex = /<Step[^>]*>([\s\S]*?)<\/Step>/g;
    const steps: string[] = [];
    let stepMatch;
    let index = 1;

    while ((stepMatch = stepRegex.exec(content)) !== null) {
      const stepContent = extractContent(stepMatch[1]).trim();
      steps.push(`${index}. ${stepContent.replace(/\n/g, '\n   ')}`);
      index++;
    }

    return steps.join('\n\n');
  });
}

/**
 * Convert <Accordion> and <AccordionItem> to sections
 */
function convertAccordions(mdx: string): string {
  const accordionRegex = /<Accordion[^>]*>([\s\S]*?)<\/Accordion>/g;

  return mdx.replace(accordionRegex, (match, content) => {
    const itemRegex = /<Accordions?(?:Item)?[^>]*?(?:title="([^"]*)")?[^>]*>([\s\S]*?)<\/Accordions?(?:Item)?>/g;
    let result = '';
    let itemMatch;

    while ((itemMatch = itemRegex.exec(content)) !== null) {
      const title = itemMatch[1] || 'Section';
      const itemContent = extractContent(itemMatch[2]).trim();
      result += `\n### ${title}\n\n${itemContent}\n`;
    }

    return result || extractContent(content);
  });
}

/**
 * Convert <YouTube> embeds to links
 */
function convertYouTube(mdx: string): string {
  const ytRegex = /<YouTube[^>]*id="([^"]+)"[^>]*(?:title="([^"]+)")?[^>]*\/?>/g;

  return mdx.replace(ytRegex, (match, id, title) => {
    const videoTitle = title || 'Video';
    return `[${videoTitle}](https://www.youtube.com/watch?v=${id})`;
  });
}

/**
 * Convert <Video> embeds to links
 */
function convertVideo(mdx: string): string {
  const videoRegex = /<Video[^>]*src="([^"]+)"[^>]*(?:title="([^"]+)")?[^>]*\/?>/g;

  return mdx.replace(videoRegex, (match, src, title) => {
    const videoTitle = title || 'Video';
    return `[${videoTitle}](${src})`;
  });
}

/**
 * Convert provider-specific components
 */
function convertProviderCards(mdx: string): string {
  // Convert <ProviderGrid>
  let result = mdx.replace(/<ProviderGrid>([\s\S]*?)<\/ProviderGrid>/g, (match, content) => {
    return content;
  });

  // Convert <ProviderCard>
  result = result.replace(
    /<ProviderCard[^>]*name="([^"]+)"[^>]*href="([^"]+)"[^>]*(?:languages=\{?\[([^\]]+)\])?[^>]*\/?>/g,
    (match, name, href, languages) => {
      const langs = languages ? ` (${languages.replace(/["']/g, '').trim()})` : '';
      return `- [${name}](${href})${langs}`;
    }
  );

  return result;
}

/**
 * Strip remaining JSX components that weren't converted
 */
function stripRemainingJsx(mdx: string): string {
  // Remove self-closing JSX tags like <Icon />, <Component />
  let result = mdx.replace(/<[A-Z][a-zA-Z]*[^>]*\/>/g, '');

  // Remove JSX opening and closing tags but keep inner content
  // This handles cases like <SomeComponent>content</SomeComponent>
  result = result.replace(/<\/?[A-Z][a-zA-Z]*[^>]*>/g, '');

  return result;
}

/**
 * Clean up extra whitespace and empty lines
 */
function cleanupWhitespace(mdx: string): string {
  return mdx
    // Replace multiple newlines with max 2
    .replace(/\n{3,}/g, '\n\n')
    // Remove trailing whitespace on lines
    .replace(/[ \t]+$/gm, '')
    // Trim the whole document
    .trim();
}

/**
 * Main conversion function: MDX with JSX components to pure Markdown
 */
export function convertMdxToMarkdown(mdx: string): string {
  let result = mdx;

  // Convert specific components in order of complexity
  result = convertTabs(result);
  result = convertCallouts(result);
  result = convertCards(result);
  result = convertSteps(result);
  result = convertAccordions(result);
  result = convertYouTube(result);
  result = convertVideo(result);
  result = convertProviderCards(result);

  // Strip any remaining JSX
  result = stripRemainingJsx(result);

  // Clean up whitespace
  result = cleanupWhitespace(result);

  return result;
}
