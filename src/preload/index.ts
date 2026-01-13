import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  scanEpubs: (dir: string, recursive: boolean) => ipcRenderer.invoke('epub:scan', dir, recursive),
  saveEpub: (filePath: string, series: string, index: string, backup: boolean, writeEpub3: boolean, writeCalibre: boolean) => ipcRenderer.invoke('epub:write', filePath, series, index, backup, writeEpub3, writeCalibre)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
