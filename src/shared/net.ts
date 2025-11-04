/**
 * NETWORK CONFIGURATION FOR CLINE
 *
 * ## Proxy Support
 *
 * Cline uses platform-specific fetch implementations to handle proxy configuration:
 * - **VSCode**: Uses global fetch (VSCode provides proxy configuration)
 * - **JetBrains/CLI**: Uses undici fetch with explicit ProxyAgent configuration
 *
 * Proxy configuration via standard environment variables:
 * - `http_proxy` / `HTTP_PROXY` - Proxy for HTTP requests
 * - `https_proxy` / `HTTPS_PROXY` - Proxy for HTTPS requests
 * - `no_proxy` / `NO_PROXY` - Comma-separated list of hosts to bypass proxy
 *
 * ## Certificate Trust
 *
 * IntelliJ exports its trusted certificates (system CAs + corporate CAs + user-added certs)
 * to a PEM file and sets NODE_EXTRA_CA_CERTS at Node process startup.
 *
 * This enables:
 * - Corporate MITM proxy certificates to be trusted
 * - Self-signed internal certificates to work
 * - Consistent TLS behavior between IntelliJ and Node.js
 *
 * ## Fetch Usage
 *
 * All fetch requests MUST use the exported fetch from this module to ensure proper proxy configuration.
 * Use `import { fetch } from '@/shared/net'` instead of global fetch.
 *
 * Note: This pattern should be enforced through code review, as automated linting cannot distinguish
 * between imported and global fetch calls.
 *
 * ## Axios Configuration
 *
 * All axios requests MUST use the fetch adapter with our configured fetch.
 * Use `getAxiosSettings()` or `createAxiosInstance()` instead of importing axios directly.
 *
 * ## Limitations
 *
 * - Proxy settings are static at startup (restart required for changes)
 * - SOCKS proxies not yet supported (requires additional undici configuration)
 * - PAC files not yet supported (long-term: requires callback to IntelliJ)
 * - Proxy authentication via env vars only (long-term: IntelliJ auth dialogs)
 *
 * ## Troubleshooting
 *
 * 1. Verify proxy env vars: `echo $http_proxy $https_proxy`
 * 2. Check certificates: `echo $NODE_EXTRA_CA_CERTS` (should point to PEM file)
 * 3. View logs: Check startup logs for proxy configuration messages
 * 4. Test connection: Use `curl` with same proxy env vars to isolate issues
 *
 * @example
 * ```typescript
 * // Good - uses configured fetch
 * import { fetch } from '@/shared/net'
 * const response = await fetch(url)
 *
 * // Good - uses fetch adapter
 * import { getAxiosSettings } from '@/shared/net'
 * await axios.get(url, { ...getAxiosSettings() })
 *
 * // Better - use helper
 * import { createAxiosInstance } from '@/shared/net'
 * const client = createAxiosInstance({ timeout: 5000 })
 * await client.get(url)
 *
 * // Bad - linter will complain
 * import axios from 'axios'
 * await axios.get(url) // ❌ Doesn't use configured fetch
 *
 * // Bad - linter will complain
 * const response = await fetch(url) // ❌ Uses global fetch, not configured
 * ```
 */

import { EnvHttpProxyAgent, setGlobalDispatcher, fetch as undiciFetch } from "undici"
import { Logger } from "@/services/logging/Logger"

/**
 * Platform-configured fetch that respects proxy settings.
 * Use this instead of global fetch to ensure proper proxy configuration.
 *
 * @example
 * ```typescript
 * import { fetch } from '@/shared/net'
 * const response = await fetch('https://api.example.com')
 * ```
 */
export const fetch: typeof globalThis.fetch = (() => {
	// Note: Don't use Logging here; it may not be initialized.

	// Detect if running in VSCode vs standalone (JetBrains/CLI)
	// In VSCode, the vscode module is available
	/* TODO: turn this off for vscode
	const isVSCode = typeof (globalThis as any).vscode !== "undefined"

	if (isVSCode) {
		// VSCode: use global fetch (VSCode's proxy config applies)
		return globalThis.fetch
	}
	*/

	// JetBrains/CLI: configure undici with ProxyAgent
	const agent = new EnvHttpProxyAgent({})
	setGlobalDispatcher(agent)

	return undiciFetch as unknown as typeof globalThis.fetch
})()

/**
 * Returns axios configuration for fetch adapter mode with our configured fetch.
 * This ensures axios uses our platform-specific fetch implementation with proper proxy configuration.
 *
 * @returns Configuration object with fetch adapter and configured fetch
 *
 * @example
 * ```typescript
 * const response = await axios.get(url, {
 *   headers: { Authorization: 'Bearer token' },
 *   timeout: 5000,
 *   ...getAxiosSettings()
 * })
 * ```
 */
export function getAxiosSettings(): { adapter?: any; fetch?: typeof globalThis.fetch } {
	Logger.info(`getAxiosSettings, http_proxy is ${process.env.http_proxy} https is ${process.env.https_proxy}`)
	return {
		adapter: "fetch" as any,
		fetch, // Use our configured fetch
	}
}
