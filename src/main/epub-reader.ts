import fs from 'fs'
import path from 'path'
import AdmZip from 'adm-zip'
import { XMLParser } from 'fast-xml-parser'

export interface EpubMetadata {
  filePath: string
  fileName: string
  title: string
  author: string
  series: string
  seriesIndex: string
  seriesSource: 'epub3' | 'calibre' | null  // 元数据来源
  cover?: string // base64 or path
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_'
})

export class EpubReader {
  static getAllEpubs(dirPath: string, recursive: boolean = false): string[] {
    let results: string[] = []
    if (!fs.existsSync(dirPath)) return results

    const list = fs.readdirSync(dirPath)

    for (const file of list) {
      const filePath = path.join(dirPath, file)
      const stat = fs.statSync(filePath)

      if (stat && stat.isDirectory()) {
        if (recursive) {
          results = results.concat(EpubReader.getAllEpubs(filePath, recursive))
        }
      } else {
        if (file.toLowerCase().endsWith('.epub')) {
          results.push(filePath)
        }
      }
    }
    return results
  }

  static readMetadata(filePath: string): EpubMetadata {
    const fileName = path.basename(filePath)
    const result: EpubMetadata = {
      filePath,
      fileName,
      title: 'Unknown',
      author: 'Unknown',
      series: '',
      seriesIndex: '',
      seriesSource: null
    }

    try {
      const zip = new AdmZip(filePath)
      const containerEntry = zip.getEntry('META-INF/container.xml')
      if (!containerEntry) return result

      const containerXml = containerEntry.getData().toString('utf-8')
      const containerObj = parser.parse(containerXml)

      // Find OPF path
      let opfPath = ''
      const rootfiles = containerObj?.container?.rootfiles?.rootfile
      if (Array.isArray(rootfiles)) {
        opfPath = rootfiles[0]['@_full-path']
      } else if (rootfiles) {
        opfPath = rootfiles['@_full-path']
      }

      if (!opfPath) return result

      const opfEntry = zip.getEntry(opfPath)
      if (!opfEntry) return result

      const opfXml = opfEntry.getData().toString('utf-8')
      const opfObj = parser.parse(opfXml)

      const metadata = opfObj?.package?.metadata
      if (!metadata) return result

      // Extract Title
      if (metadata['dc:title']) {
        result.title = typeof metadata['dc:title'] === 'string'
          ? metadata['dc:title']
          : (metadata['dc:title']['#text'] || 'Unknown')
      }

      // Extract Author
      if (metadata['dc:creator']) {
        if (Array.isArray(metadata['dc:creator'])) {
          result.author = metadata['dc:creator'].map(c => typeof c === 'string' ? c : c['#text']).join(', ')
        } else {
          result.author = typeof metadata['dc:creator'] === 'string'
            ? metadata['dc:creator']
            : (metadata['dc:creator']['#text'] || '')
        }
      }

      // Extract Series
      let metaTags = metadata.meta || []
      if (!Array.isArray(metaTags)) metaTags = [metaTags]

      // 1. 优先读取 EPUB3 格式 (belongs-to-collection)
      const epub3Series = metaTags.find((m: any) => m['@_property'] === 'belongs-to-collection')
      if (epub3Series) {
        result.series = epub3Series['#text']
        result.seriesSource = 'epub3'
        // 读取 group-position 作为序号
        const id = epub3Series['@_id']
        if (id) {
          const pos = metaTags.find((m: any) => m['@_refines'] === `#${id}` && m['@_property'] === 'group-position')
          if (pos) {
            result.seriesIndex = pos['#text']
          }
        }
      }

      // 2. 如果没有 EPUB3 格式，读取 Calibre 格式
      if (!result.series) {
        const calSeries = metaTags.find((m: any) => m['@_name'] === 'calibre:series' || m['@_property'] === 'calibre:series')
        if (calSeries) {
          result.series = calSeries['@_content'] || calSeries['#text']
          result.seriesSource = 'calibre'
        }

        const calIndex = metaTags.find((m: any) => m['@_name'] === 'calibre:series_index' || m['@_property'] === 'calibre:series_index')
        if (calIndex) {
          result.seriesIndex = calIndex['@_content'] || calIndex['#text']
        }
      }
    } catch (e) {
      console.error(`Error reading ${filePath}`, e)
    }

    return result
  }
}
