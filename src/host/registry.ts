/**
 * Host Registry — global access to the active HostAdapter
 *
 * Tools import getHost() to access file I/O, shell execution, etc.
 * without depending on Node.js APIs directly.
 */

import type { HostAdapter } from './types'

let currentHost: HostAdapter | null = null

/** Set the active host adapter (called during initialization) */
export function setHost(host: HostAdapter): void {
  currentHost = host
}

/** Get the active host adapter (throws if not initialized) */
export function getHost(): HostAdapter {
  if (!currentHost) {
    throw new Error('HostAdapter not initialized. Call setHost() first.')
  }
  return currentHost
}

/** Check if a host adapter is available */
export function hasHost(): boolean {
  return currentHost !== null
}
