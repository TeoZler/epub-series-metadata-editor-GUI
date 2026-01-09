import { ElectronAPI } from '@electron-toolkit/preload'

interface EpubMetadata {
  filePath: string
  fileName: string
  title: string
  author: string
  series: string
  seriesIndex: string
  cover?: string
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      openDirectory: () => Promise<string | null>
      scanEpubs: (dir: string, recursive: boolean) => Promise<EpubMetadata[]>
      saveEpub: (filePath: string, series: string, index: string, backup: boolean) => Promise<{ success: boolean; error?: string }>
    }
  }
}
