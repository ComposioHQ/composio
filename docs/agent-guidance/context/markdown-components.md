# Custom component Markdown audit

Audit for DEVREL-35, 2026-09-10. Scope: components registered in `mdx-components.tsx` and used in `content/`. The page endpoint and full corpus call `getLLMText`; local and Algolia search records call `mdxToCleanMarkdown` on authored MDX.

| Content | Components | Result |
| --- | --- | --- |
| Package installation | `PackageInstall` | Preserve all supported package-manager commands and display comments. Node and Python manager definitions are shared with the UI. Test every authored instance. |
| Coding-agent setup | `AgentSetupActions`, `AgentFirstPrompt`, `AgentSetupGrid` | Preserve the same prompts and client destinations as the UI through shared data modules. |
| Versioned API details | `ApiBaseUrl`, `ApiEndpointsTable` | Existing converters preserve version-specific URLs and endpoint tables. Existing tests cover raw and processed attributes. |
| Decisions and warnings | `Callout`, `Tabs`, `Tab`, `TabsContent`, `FrameworkOption`, `IntegrationTabs`, `IntegrationContent`, `ToolTypeOption`, `ConnectClientOption`, `Accordion` | Existing converters retain text, labels, and warning content. |
| Step instructions and definitions | `Steps`, `Step`, `StepTitle`, `Glossary`, `GlossaryTerm` | Existing converters retain headings and content. |
| Linked content | `Card`, `ProviderCard`, `TemplateCard`, `HomeSurfaces`, `AIToolsBanner` | Existing converters retain destinations or route readers to canonical setup instructions. |
| Media | `Figure`, `YouTube`, `Video` | Preserve captions and source links. Video links now survive conversion. Transcription of media is outside this audit. |
| Example source | `FileBuildup`, `RepoBrowser` | Existing converters expose staged source or an explicit repository-availability notice. |
| Structural wrappers and icons | `Cards`, `ProviderGrid`, `TemplateGrid`, `QuickstartFlow`, `FrameworkSelector`, `ToolTypeFlow`, `ConnectFlow`, `Accordions`, `CapabilityList`, `MediaSplit`, `AppLogo`, registered Lucide icons | Wrappers have no task instructions; their child content survives. Icons are decorative. |
| Visual explanations | `SessionFlow`, `TriggersFlow`, `SlackBotFlow`, `LocalWorkbenchFlow`, `LocalSandboxBoundary`, `ImessageFlow`, `WorkbenchFlow`, `AuthConfigFlow`, `WhiteLabelFlow`, `ImportConnectionFlow`, `ManageConnectionsVisual`, `ConnectionRefreshVisual`, `InChatAuthTerminal`, `ClaudeMockUI` | Diagrams illustrate the surrounding guide. The authored instructions remain the executable path. Full visual-to-text parity is a follow-up, not claimed by this fix. |
| Mermaid | `Mermaid` | `getLLMText` preserves processed diagram code. Raw component diagrams in search require separate parity coverage. |
| Homepage and catalogs | `DocsHero`, `HomeFeatures`, `HomeResources`, `ToolkitsLanding`, `ManagedAuthList` | Dynamic content is not fully serialized by the generic converter. Product selection survives through `HomeSurfaces`; toolkit routes have dedicated Markdown renderers, and managed-auth prose includes the API lookup. Full catalog and homepage parity remains a follow-up. |

`CapabilityCard` is registered but has no authored instances at this revision. Add a Markdown representation before introducing it into task-critical content.

## Remaining checks

The [semantic parity suite](./semantic-parity.md) for DEVREL-32 checks actual HTTP page output, the full corpus, and search ingestion against the same expected facts. Its export checker applies those expectations to external retrieval captures. Static tests cannot prove an external index refreshed. DEVREL-38 can use the remaining visual and catalog gaps to prioritize task-complete pages. Do not treat this audit as evidence of benchmark improvement.
