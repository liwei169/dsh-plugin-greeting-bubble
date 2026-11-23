/**
 * Host half of the greeting-bubble bundle.
 *
 * The whole feature lives in the browser half (`client.js`): the Host row only
 * keeps the Loader entry alive so the client module system serves the bundle
 * and the browser mounts it into `shell.overlay`. Nothing runs on the Host, so
 * the plugin adds no model-facing tools, no requests, and no session state.
 */
export function apply() {}
