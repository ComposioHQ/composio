const urls = new Set();

function checkURL(request, init) {
	const url =
		request instanceof URL
			? request
			: new URL(
					(typeof request === "string"
						? new Request(request, init)
						: request
					).url
				);
	if (url.port && url.port !== "443" && url.protocol === "https:") {
		if (!urls.has(url.toString())) {
			urls.add(url.toString());
			console.warn(
				`WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:\n` +
					` - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.\n`
			);
		}
	}
}

globalThis.fetch = new Proxy(globalThis.fetch, {
	apply(target, thisArg, argArray) {
		const [request, init] = argArray;
		checkURL(request, init);
		return Reflect.apply(target, thisArg, argArray);
	},
});
