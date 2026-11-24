declare module 'cloudflare:test' {
	// oxlint-disable-next-line typescript/no-empty-object-type -- Cloudflare populates ProvidedEnv through interface merging
	interface ProvidedEnv extends Env {}
}
