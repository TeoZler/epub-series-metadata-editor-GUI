import fs from 'fs'
import path from 'path'
import AdmZip from 'adm-zip'
import { XMLParser } from 'fast-xml-parser'

export class EpubWriter {
    // XML转义函数
    private static xmlEscape(t: string): string {
        return t.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;')
    }

    // 最小化注入系列标签算法 (移植自 Python 版本)
    private static injectSeriesMinimal(
        dataBytes: Buffer,
        series: string,
        index: string | null,
        writeCollection: boolean = true,
        writeCalibre: boolean = false // 默认不强制写 Calibre，除非用户选了
    ): Buffer {
        let s = ''
        try {
            s = dataBytes.toString('utf-8')
        } catch (e) {
            // Fallback or error handling
            throw new Error('Failed to decode OPF as UTF-8')
        }

        // 匹配整个 metadata 片段
        // JS正则不支持 (?P<name>) 命名分组，需用索引
        // Group 1: <prefix:metadata ...>
        // Group 2: prefix (optional)
        // Group 3: body
        // Group 4: </prefix:metadata>
        const metaRegex = /(<([A-Za-z_][\w\-]*:)?metadata\b[^>]*>)([\s\S]*?)(<\/(\2)?metadata>)/i
        const match = s.match(metaRegex)

        if (!match) {
            throw new Error('OPF missing metadata tag')
        }

        const prefixTag = match[1]
        let body = match[3]
        const suffixTag = match[4]

        // 清理旧标签
        // Calibre series
        body = body.replace(/\s*<\s*calibre:series\b[^>]*>[\s\S]*?<\/\s*calibre:series\s*>\s*/gi, '')
        body = body.replace(/\s*<\s*calibre:series_index\b[^>]*>[\s\S]*?<\/\s*calibre:series_index\s*>\s*/gi, '')
        // Calibre meta tags
        body = body.replace(/\s*<\s*meta\b[^>]*\bname\s*=\s*"(?:calibre:series|calibre:series_index)"[^>]*\/>\s*/gi, '')
        body = body.replace(/\s*<\s*meta\b[^>]*\bproperty\s*=\s*"(?:calibre:series|calibre:series_index)"[^>]*>[\s\S]*?<\/\s*meta\s*>\s*/gi, '')

        // EPUB3 collection
        body = body.replace(/\s*<\s*meta\b[^>]*\bproperty\s*=\s*"belongs-to-collection"[^>]*\/>\s*/gi, '')
        body = body.replace(/\s*<\s*meta\b[^>]*\bproperty\s*=\s*"belongs-to-collection"[^>]*>[\s\S]*?<\/\s*meta\s*>\s*/gi, '')
        body = body.replace(/\s*<\s*meta\b[^>]*\bproperty\s*=\s*"(?:collection-type|group-position)"[^>]*\/>\s*/gi, '')
        body = body.replace(/\s*<\s*meta\b[^>]*\bproperty\s*=\s*"(?:collection-type|group-position)"[^>]*>[\s\S]*?<\/\s*meta\s*>\s*/gi, '')

        // 计算缩进
        const sample = body.substring(0, 200)
        const indentMatch = sample.match(/\s*\n([ \t]*)/)
        const indent = indentMatch ? indentMatch[1] : '  '

        let ins = ''

        // 构造 EPUB3 标签
        if (writeCollection && series) {
            const rid = `col${Math.floor(Math.random() * 90000) + 10000}`
            ins += `\n${indent}<meta property="belongs-to-collection" id="${rid}">${this.xmlEscape(series)}</meta>`
            ins += `\n${indent}<meta refines="#${rid}" property="collection-type">series</meta>`
            if (index) {
                ins += `\n${indent}<meta refines="#${rid}" property="group-position">${index}</meta>`
            }
        }

        // 构造 Calibre 标签 (如果需要)
        // 许多阅读器兼容 Calibre 标签，建议默认开启或作为选项
        if (writeCalibre && series) {
            ins += `\n${indent}<meta name="calibre:series" content="${this.xmlEscape(series)}" />`
            if (index) {
                ins += `\n${indent}<meta name="calibre:series_index" content="${index}" />`
            }
        }

        // 组合新内容
        const startsNl = body.startsWith('\n') || body.startsWith('\r\n')
        const post = startsNl ? '' : '\n'
        const newBody = ins + post + body

        // 替换回原字符串
        // 注意：match.index 是匹配起始位置
        const startIndex = match.index! + prefixTag.length
        const endIndex = match.index! + match[0].length - suffixTag.length

        const newStr = s.substring(0, startIndex) + newBody + s.substring(endIndex)

        return Buffer.from(newStr, 'utf-8')
    }

    static async writeSeries(
        filePath: string,
        series: string,
        index: string,
        backup: boolean = true,
        writeEpub3: boolean = true,
        writeCalibre: boolean = true
    ): Promise<boolean> {
        try {
            const zip = new AdmZip(filePath)

            // 1. Find OPF
            const containerEntry = zip.getEntry('META-INF/container.xml')
            if (!containerEntry) throw new Error('Invalid EPUB: No container.xml')

            const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })
            const containerObj = parser.parse(containerEntry.getData().toString('utf-8'))

            let opfPath = ''
            const rootfiles = containerObj?.container?.rootfiles?.rootfile
            if (Array.isArray(rootfiles)) {
                opfPath = rootfiles[0]['@_full-path']
            } else if (rootfiles) {
                opfPath = rootfiles['@_full-path']
            }
            if (!opfPath) throw new Error('No OPF path found')

            const opfEntry = zip.getEntry(opfPath)
            if (!opfEntry) throw new Error(`OPF file not found: ${opfPath}`)

            // 2. Generate new OPF content
            const originalData = opfEntry.getData()
            const newData = this.injectSeriesMinimal(originalData, series, index, writeEpub3, writeCalibre)

            // 3. Backup
            if (backup) {
                const bakPath = filePath + '.bak'
                fs.copyFileSync(filePath, bakPath)
            }

            // 4. Update Zip
            zip.updateFile(opfPath, newData)
            zip.writeZip(filePath)

            return true
        } catch (e) {
            console.error(`Failed to write ${filePath}:`, e)
            throw e
        }
    }
}
