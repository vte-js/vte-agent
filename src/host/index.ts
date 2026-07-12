/**
 * Host Adapter - barrel exports
 */

export type {
  HostAdapter, HostFileSystem, HostWorkspace, HostUI,
  HostMessaging, HostShell, HostLSP, HostGit, Disposable,
} from './types'

export { VSCodeHostAdapter, VSCodeMessaging } from './vscode'
export { setHost, getHost, hasHost } from './registry'
