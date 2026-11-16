# Effect lint rules

Adapted from [K-Mistele/anti-slop](https://github.com/K-Mistele/anti-slop/tree/b7c1619b4d51b4815e89ba3700a975a6ec54b8c3),
commit `b7c1619b4d51b4815e89ba3700a975a6ec54b8c3` (MIT, copyright Dillon Mulroy).
The license is preserved in [LICENSE](LICENSE).

Borrowed files: `src/effect/rules/require-cause-when-narrowing.ts`,
`src/effect/rules/no-ordie-in-service-construction.ts`, their fixtures, and the
parts of `src/effect/shared/effect-modules.ts` those rules use.

Local changes adapt the diagnostics to Composio's tagged-error conventions,
remove unused helpers, and register only these two rules as `composio-effect`.
Import recognition also resolves lexical bindings, so a local parameter that
shadows an Effect import is not treated as the Effect module.
Local traversal handles conditional error replacements, property values yielded
during construction, and transparent wrappers around service options while
preserving deferred service operations.
These are syntax and same-file scope checks, not type checking or a proof that
every failure retains its cause.
