export type ScriptsTab = 'manual' | 'batch'

export function parseScriptsTab(search: string): ScriptsTab {
  const tab = new URLSearchParams(search).get('tab')
  return tab === 'batch' ? 'batch' : 'manual'
}

export function scriptsListPath(tab: ScriptsTab = 'manual'): string {
  return tab === 'batch' ? '/scripts?tab=batch' : '/scripts?tab=manual'
}
