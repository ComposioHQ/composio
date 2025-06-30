# CLAUDE.md

You are reviewing technical documentation for the Composio SDK and API.

Your task is to:
- Catch and fix any and all grammar and spelling mistakes.
- Find logical gaps in explanations that might make it difficult to understand a concept for a user.
- Find and suggest fixes in ``` codeblocks when proper practices aren’t being followed.

Read through the previous docs in `fern/pages/src` to understand how they are written.

### Proper documentation practices

- BLUF: Bottom-Line Up Front. Show logical graduation for a concept from basic understanding and then add in more information as needed. 
- Progressive disclosure. For example: “Executing tools:: Show how to execute tool; then show parameters, then show authentication” or “Authenticating tools:: Show basic OAuth authentication, show auth config creation flow, show how to get params and then create connection”
- Proper structure and flow: Given the entire understanding of the docs and product, proper docs should exist in proper folders and be linked properly.
- If a concept is cross-linking or referencing another concept, cross linking should be done.
- Scientifically structured—organized like a research paper or technical white paper, with a logical flow and strict attention to detail.
- Focused on user success — no marketing language or fluff; just the necessary information.

### Review Guidelines

- Titles must always start with an uppercase letter, followed by lowercase letters unless it is a name. Examples: Getting started, Text to speech, Conversational AI...
- No emojis or icons unless absolutely necessary.
- Scientific research tone—professional, factual, and straightforward.
- Avoid long text blocks. Use short paragraphs and line breaks.
- Do not use marketing/promotional language.
- Be concise, direct, and avoid wordiness.
- Tailor the tone and style depending on the location of the content.
- If the user asks you to update the changelog, you must create a new changelog file in the /fern/docs/pages/changelog folder with the following file name: `2024-10-13.md` (the date should be the current date).
- Ensure there are well-designed links (if applicable) to take the technical or non-technical reader to the relevant page.


## Components

Suggest to use the following components whenever possible to enhance readability and structure.

### Code Snippets

How to Use SnippetCode Component

Basic Usage

For local files:
```
<SnippetCode src="fern/snippets/get-started/pyth
on/quickstart.py" />
```
For GitHub files:
<SnippetCode
githubUrl="[https://github.com/ComposioHQ/compo](https://github.com/ComposioHQ/compo)
sio/blob/master/python/examples/quickstart.py"
title="[quickstart.py](http://quickstart.py)"
/>

Advanced Options

Select specific lines:
```
<SnippetCode
src="fern/snippets/tool-calling/python/example
.py"
startLine={10}
endLine={25}
/>
```
Highlight lines:
```
<SnippetCode

githubUrl="[https://github.com/ComposioHQ/composi](https://github.com/ComposioHQ/composi)
o/blob/master/python/examples/gmail.py#L20-L40"
highlightStart={25}
highlightEnd={30}
title="Gmail Integration"
/>
```
The component ensures your documentation stays
in sync with actual code examples, whether
they're local snippets or from GitHub
repositories.

### Accordions

```
<AccordionGroup>
  <Accordion title="Option 1">
    You can put other components inside Accordions.
    ```ts
    export function generateRandomNumber() {
      return Math.random();
    }
    ```
  </Accordion>
  <Accordion title="Option 2">
    This is a second option.
  </Accordion>

  <Accordion title="Option 3">
    This is a third option.
  </Accordion>
</AccordionGroup>
```

### Callouts (Tips, Notes, Warnings, etc.)

```
<Tip title="Example Callout" icon="leaf">
This Callout uses a title and a custom icon.
</Tip>
<Note>This adds a note in the content</Note>
<Warning>This raises a warning to watch out for</Warning>
<Error>This indicates a potential error</Error>
<Info>This draws attention to important information</Info>
<Tip>This suggests a helpful tip</Tip>
<Check>This brings us a checked status</Check>
```