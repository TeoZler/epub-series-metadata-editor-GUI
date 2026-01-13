import { useState, useEffect, useMemo, createContext, useContext } from 'react'
import { Button, Table, message, Checkbox, ConfigProvider, theme, Space, Select, Input, Modal, Dropdown, MenuProps, Card, Tooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useTranslation } from 'react-i18next'
import { Moon, Sun, Save, ListOrdered, Edit, ArrowDown01, X, FolderInput, GripVertical, Folder, FolderOpen, Undo2, Wand2 } from 'lucide-react'
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core'
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { Resizable } from 'react-resizable'

interface EpubMetadata {
    filePath: string
    fileName: string
    folderPath: string
    title: string
    author: string
    series: string
    seriesIndex: string
    seriesSource: 'epub3' | 'calibre' | null
    cover?: string
}

// Tree Node Type
interface DataNode extends Partial<EpubMetadata> {
    key: string
    isFolder: boolean
    children?: DataNode[]
    fileCount?: number
    depth?: number // Nesting level for indentation
    isLastChild?: boolean // Is this the last sibling at its level
    ancestorIsLast?: boolean[] // Track if ancestors are last children (for drawing │ vs space)
}

// Resizable Header
const ResizableTitle = (props: any) => {
    const { onResize, width, ...restProps } = props

    if (!width) {
        return <th {...restProps} />
    }

    return (
        <Resizable
            width={width}
            height={0}
            handle={
                <span
                    className="react-resizable-handle"
                    onClick={(e) => {
                        e.stopPropagation()
                    }}
                />
            }
            onResize={onResize}
            draggableOpts={{ enableUserSelectHack: false }}
        >
            <th {...restProps} />
        </Resizable>
    )
}

// Drag Handle Context
interface RowContextProps {
    listeners?: any
    attributes?: any
    setActivatorNodeRef?: (element: HTMLElement | null) => void
}

const RowContext = createContext<RowContextProps>({})

// Sortable Row Component
// Modified to handle both Drag and Resize props
const Row = (props: any) => {
    const { 'data-row-key': rowKey, style, ...restProps } = props

    // Ensure we have a valid ID for useSortable
    const safeId = rowKey || 'unknown-row-' + Math.random()

    const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
        id: safeId,
        disabled: !rowKey || (typeof rowKey === 'string' && rowKey.startsWith('folder-')), // Disable drag for folders
    })

    const rowStyle: React.CSSProperties = {
        ...style,
        transform: CSS.Transform.toString(transform && { ...transform, scaleY: 1 }),
        transition,
        ...(isDragging ? { position: 'relative', zIndex: 9999 } : {}),
        userSelect: 'none',
    }

    const contextValue = useMemo(
        () => ({ attributes, listeners, setActivatorNodeRef }),
        [attributes, listeners, setActivatorNodeRef]
    )

    return (
        <RowContext.Provider value={contextValue}>
            <tr {...restProps} style={rowStyle} ref={setNodeRef} />
        </RowContext.Provider>
    )
}

const DragHandle = ({ itemKey }: { itemKey: string }) => {
    const { attributes, listeners, setActivatorNodeRef } = useSortable({
        id: itemKey,
        disabled: itemKey.startsWith('folder-'),
    })

    // Always show the icon, but only enable grab cursor when draggable
    const isEnabled = !!listeners
    const cursor = isEnabled ? 'grab' : 'default'

    return (
        <div
            ref={setActivatorNodeRef}
            {...(isEnabled ? attributes : {})}
            {...(isEnabled ? listeners : {})}
            style={{ cursor, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', outline: 'none', userSelect: 'none' }}
        >
            <span style={{ color: '#999', fontSize: '14px', lineHeight: 1 }}>⠿</span>
        </div>
    )
}

function App(): JSX.Element {
    const { t, i18n } = useTranslation()
    const [dirPath, setDirPath] = useState<string>('')

    // Data States
    const [treeData, setTreeData] = useState<DataNode[]>([]) // Tree structure for Table
    const [flatData, setFlatData] = useState<EpubMetadata[]>([]) // Flat list for logic
    const [originalData, setOriginalData] = useState<Map<string, EpubMetadata>>(new Map())

    const [loading, setLoading] = useState(false)
    const [recursive, setRecursive] = useState(false)
    const [modifiedFiles, setModifiedFiles] = useState<Set<string>>(new Set())
    const [saving, setSaving] = useState(false)
    const [backup, setBackup] = useState(true)
    const [writeEpub3, setWriteEpub3] = useState(true)  // EPUB3 标准格式
    const [writeCalibre, setWriteCalibre] = useState(true)  // Calibre 兼容格式

    // Selection state
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
    const [lastSelectedKey, setLastSelectedKey] = useState<string | null>(null)

    // Column widths state
    const [columns, setColumns] = useState<any[]>([])

    // Modal state
    const [isSeriesModalOpen, setIsSeriesModalOpen] = useState(false)
    const [newSeriesName, setNewSeriesName] = useState('')

    // History for undo (stores previous flatData and modifiedFiles)
    interface HistoryState {
        flatData: EpubMetadata[]
        modifiedFiles: Set<string>
    }
    const [history, setHistory] = useState<HistoryState[]>([])
    const maxHistoryLength = 20

    // Drag sensors
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 1,
            },
        })
    )

    // Dark mode
    const [isDarkMode, setIsDarkMode] = useState(() => {
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    })

    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
        const handleChange = (e: MediaQueryListEvent) => setIsDarkMode(e.matches)
        mediaQuery.addEventListener('change', handleChange)
        return () => mediaQuery.removeEventListener('change', handleChange)
    }, [])

    useEffect(() => {
        if (isDarkMode) {
            document.body.style.backgroundColor = '#141414'
            document.documentElement.setAttribute('data-theme', 'dark')
        } else {
            document.body.style.backgroundColor = '#ffffff'
            document.documentElement.setAttribute('data-theme', 'light')
        }
    }, [isDarkMode])

    // Initialize columns
    useEffect(() => {
        setColumns(prevColumns => {
            const getWidth = (key: string, defaultWidth: number) => {
                if (!prevColumns || prevColumns.length === 0) return defaultWidth
                const col = prevColumns.find((c: any) => c.key === key)
                return col ? col.width : defaultWidth
            }

            const baseColumns: ColumnsType<DataNode> = [
                {
                    key: 'sort',
                    width: getWidth('sort', 40),
                    className: 'drag-handle-cell',
                    render: (_, record) => !record.isFolder && <DragHandle itemKey={record.key} />,
                },
                {
                    title: t('app.table.filename'),
                    dataIndex: 'fileName',
                    key: 'fileName',
                    width: getWidth('fileName', 300),
                    render: (text, record) => {
                        const depth = record.depth || 0
                        const ancestorIsLast = record.ancestorIsLast || []
                        const isLast = record.isLastChild ?? false

                        // Build vertical lines using CSS
                        const verticalLines: JSX.Element[] = []
                        for (let i = 0; i < depth; i++) {
                            const showLine = !ancestorIsLast[i]
                            if (showLine) {
                                verticalLines.push(
                                    <div
                                        key={i}
                                        className="tree-vertical-line"
                                        style={{ '--line-index': i } as React.CSSProperties}
                                    />
                                )
                            }
                        }

                        const content = record.isFolder ? (
                            <>
                                <FolderOpen size={16} style={{ marginRight: 6, flexShrink: 0 }} />
                                <span style={{ fontWeight: 'bold' }}>{record.folderPath}</span>
                                <span style={{ opacity: 0.5, fontSize: 12, marginLeft: 6 }}>({record.fileCount})</span>
                            </>
                        ) : (
                            <span>{text}</span>
                        )

                        return (
                            <div
                                className="tree-lines-container"
                                style={{ '--depth': depth, position: 'relative', height: '100%', minHeight: 32 } as React.CSSProperties}
                            >
                                {verticalLines}
                                {depth > 0 && (
                                    <div className={`tree-branch ${isLast ? 'is-last' : ''}`} style={{ marginRight: 4 }}>
                                        <span style={{ width: 12 }}></span>
                                    </div>
                                )}
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                    {content}
                                </div>
                            </div>
                        )
                    }
                },
                {
                    title: t('app.table.title'),
                    dataIndex: 'title',
                    key: 'title',
                    width: getWidth('title', 250),
                },
                {
                    title: t('app.table.series'),
                    dataIndex: 'series',
                    key: 'series',
                    width: getWidth('series', 200),
                    render: (text, record) => !record.isFolder && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Input
                                value={text}
                                onChange={e => handleDataChange(record.filePath!, 'series', e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                bordered={false}
                                style={{ padding: '0 4px', background: modifiedFiles.has(record.filePath!) ? 'rgba(24, 144, 255, 0.1)' : undefined, flex: 1 }}
                            />
                            {record.seriesSource === 'calibre' && record.series && (
                                <Tooltip title={t('app.sourceCalibre')}>
                                    <span style={{ color: '#faad14', fontSize: 12, cursor: 'help' }}>⚠️</span>
                                </Tooltip>
                            )}
                        </div>
                    )
                },
                {
                    title: t('app.table.index'),
                    dataIndex: 'seriesIndex',
                    key: 'seriesIndex',
                    width: getWidth('seriesIndex', 100),
                    render: (text, record) => !record.isFolder && (
                        <Input
                            value={text}
                            onChange={e => handleDataChange(record.filePath!, 'seriesIndex', e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            bordered={false}
                            style={{ padding: '0 4px', background: modifiedFiles.has(record.filePath!) ? 'rgba(24, 144, 255, 0.1)' : undefined }}
                        />
                    )
                },
                {
                    title: '',
                    key: 'status',
                    width: getWidth('status', 30),
                    render: (_, record) => !record.isFolder && modifiedFiles.has(record.filePath!) ? <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#1890ff' }} /> : null
                }
            ]
            return baseColumns
        })
    }, [t, modifiedFiles])

    const handleResize = (index) => (_e, { size }) => {
        setColumns((columns) => {
            const nextColumns = [...columns]
            nextColumns[index] = {
                ...nextColumns[index],
                width: size.width,
            }
            return nextColumns
        })
    }

    const mergedColumns = columns.map((col, index) => ({
        ...col,
        onHeaderCell: (column) => ({
            width: column.width,
            onResize: handleResize(index),
        }),
    }))

    const handleSelectDir = async () => {
        const path = await window.api.openDirectory()
        if (path) {
            setDirPath(path)
            loadEpubs(path, recursive)
        }
    }

    const handleRecursiveChange = (e: any) => {
        const checked = e.target.checked
        setRecursive(checked)
        if (dirPath) {
            loadEpubs(dirPath, checked)
        }
    }

    const buildTree = (files: EpubMetadata[], rootPath: string): DataNode[] => {
        const root: DataNode[] = []
        const folderMap = new Map<string, DataNode>()

        // Helper to ensure paths are comparable (handle separators)
        const normalize = (p: string) => p.replace(/\\/g, '/').replace(/\/$/, '')
        const normalizedRoot = normalize(rootPath)

        const getFolderNode = (parentArr: DataNode[], fullPath: string, folderName: string, depth: number): DataNode => {
            const key = `folder-${fullPath}`
            if (folderMap.has(fullPath)) return folderMap.get(fullPath)!

            const newNode: DataNode = {
                key,
                isFolder: true,
                folderPath: folderName, // This is used for display in the Name column
                children: [],
                fileCount: 0,
                depth
            }
            parentArr.push(newNode)
            folderMap.set(fullPath, newNode)
            return newNode
        }

        files.forEach(f => {
            const normalizedFilePath = normalize(f.filePath)

            // Calculate relative path
            // We assume f.filePath is inside rootPath (or recursive children)
            // If not, we might need a fallback, but scanEpubs guarantees it.
            let relative = ''
            if (normalizedFilePath.startsWith(normalizedRoot)) {
                relative = normalizedFilePath.slice(normalizedRoot.length)
            } else {
                // Fallback for potential case mismatch on Windows
                const lowerFilePath = normalizedFilePath.toLowerCase()
                const lowerRoot = normalizedRoot.toLowerCase()
                if (lowerFilePath.startsWith(lowerRoot)) {
                    relative = normalizedFilePath.slice(lowerRoot.length)
                } else {
                    // Should not happen if scan is correct, but treat as root file if so
                    relative = '/' + f.fileName
                }
            }

            // Remove leading slash
            relative = relative.replace(/^\//, '')

            const parts = relative.split('/')

            let currentLevel = root
            let currentPath = normalizedRoot

            // Iterate folders
            let currentDepth = 0
            for (let i = 0; i < parts.length - 1; i++) {
                const part = parts[i]
                currentPath = `${currentPath}/${part}`

                const folderNode = getFolderNode(currentLevel, currentPath, part, currentDepth)
                folderNode.fileCount = (folderNode.fileCount || 0) + 1
                currentLevel = folderNode.children!
                currentDepth++
            }

            // Add file with depth
            currentLevel.push({
                ...f,
                key: f.filePath,
                isFolder: false,
                depth: currentDepth
            })
        })

        // Recursive sort: only move folders to top, preserve file order from flatData
        const sortNodes = (nodes: DataNode[]) => {
            // Separate folders and files
            const folders = nodes.filter(n => n.isFolder)
            const files = nodes.filter(n => !n.isFolder)

            // Sort folders alphabetically
            folders.sort((a, b) => {
                const nameA = a.folderPath || ''
                const nameB = b.folderPath || ''
                return nameA.localeCompare(nameB, undefined, { numeric: true })
            })

            // Files keep their order from flatData (preserves drag order)
            // Clear and repopulate: folders first, then files
            nodes.length = 0
            nodes.push(...folders, ...files)

            // Recursively sort children
            nodes.forEach(n => {
                if (n.children) sortNodes(n.children)
            })
        }

        sortNodes(root)

        // Mark last children and propagate ancestor path for tree lines
        const markLastChildren = (nodes: DataNode[], ancestorPath: boolean[] = []) => {
            nodes.forEach((node, index) => {
                const isLast = index === nodes.length - 1
                node.isLastChild = isLast
                node.ancestorIsLast = [...ancestorPath]
                if (node.children && node.children.length > 0) {
                    markLastChildren(node.children, [...ancestorPath, isLast])
                }
            })
        }
        markLastChildren(root)

        return root
    }

    const loadEpubs = async (path: string, isRecursive: boolean) => {
        setLoading(true)
        try {
            const files = await window.api.scanEpubs(path, isRecursive)

            // Sort files by path initially
            files.sort((a, b) => a.filePath.localeCompare(b.filePath, undefined, { numeric: true, sensitivity: 'base' }))

            const processedFiles = files.map(f => {
                const parts = f.filePath.split(/[/\\]/)
                const parentDir = parts.length > 1 ? parts[parts.length - 2] : ''
                return { ...f, folderPath: parentDir }
            })

            setFlatData(processedFiles)
            setTreeData(buildTree(processedFiles, path))

            const originalMap = new Map<string, EpubMetadata>()
            processedFiles.forEach(f => originalMap.set(f.filePath, { ...f }))
            setOriginalData(originalMap)

            setModifiedFiles(new Set())
            setSelectedRowKeys([])
            setLastSelectedKey(null)
            message.success(t('app.foundBooks', { count: files.length }))
        } catch (e) {
            message.error(t('app.loadFailed'))
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    const checkIfModified = (item: EpubMetadata, original: EpubMetadata | undefined): boolean => {
        if (!original) return true

        // Normalize series index for comparison (handle "1.0" vs "1", empty vs undefined, number vs string etc.)
        const normalizeIndex = (val: string | number | undefined): string => {
            if (val === null || val === undefined) return ''
            const strVal = String(val).trim()
            if (strVal === '') return ''
            const num = parseFloat(strVal)
            if (isNaN(num)) return strVal
            // If it's a whole number, return without decimal; otherwise keep decimal
            return Number.isInteger(num) ? String(Math.floor(num)) : String(num)
        }

        const normalizeSeries = (val: string | undefined): string => {
            if (val === null || val === undefined) return ''
            return String(val).trim()
        }

        const seriesChanged = normalizeSeries(item.series) !== normalizeSeries(original.series)
        const indexChanged = normalizeIndex(item.seriesIndex) !== normalizeIndex(original.seriesIndex)

        return seriesChanged || indexChanged
    }

    // Helper to update both tree and flat data
    const updateData = (updater: (prevFlat: EpubMetadata[]) => EpubMetadata[]) => {
        const newFlat = updater(flatData)
        setFlatData(newFlat)
        setTreeData(buildTree(newFlat, dirPath)) // Rebuild tree from new flat data
    }

    const handleDataChange = (filePath: string, field: keyof EpubMetadata, value: string) => {
        updateData(prev => {
            const newData = prev.map(item => {
                if (item.filePath === filePath) {
                    return { ...item, [field]: value }
                }
                return item
            })

            setModifiedFiles(prevMod => {
                const newMod = new Set(prevMod)
                const newItem = newData.find(i => i.filePath === filePath)
                const originalItem = originalData.get(filePath)

                if (newItem && checkIfModified(newItem, originalItem)) {
                    newMod.add(filePath)
                } else {
                    newMod.delete(filePath)
                }
                return newMod
            })

            return newData
        })
    }

    const handleSave = async () => {
        if (modifiedFiles.size === 0) {
            message.info(t('app.noChanges'))
            return
        }

        setSaving(true)
        const hide = message.loading(t('app.saving'), 0)

        let successCount = 0
        let failCount = 0

        try {
            const filesToSave = flatData.filter(item => modifiedFiles.has(item.filePath))

            for (const file of filesToSave) {
                const res = await window.api.saveEpub(file.filePath, file.series, file.seriesIndex, backup, writeEpub3, writeCalibre)
                if (res.success) {
                    successCount++
                    setOriginalData(prev => {
                        const newMap = new Map(prev)
                        newMap.set(file.filePath, { ...file })
                        return newMap
                    })
                } else {
                    failCount++
                    console.error(`Failed to save ${file.fileName}:`, res.error)
                }
            }

            if (failCount === 0) {
                message.success(t('app.saveSuccess'))
                setModifiedFiles(new Set())
            } else {
                message.warning(t('app.savePartial', { fail: failCount }))
                setModifiedFiles(prev => {
                    const newSet = new Set(prev)
                    return newSet
                })
            }
        } catch (e) {
            message.error(t('app.saveFailed'))
        } finally {
            hide()
            setSaving(false)
        }
    }

    // --- Batch Operations ---

    const batchUpdate = (updater: (item: EpubMetadata) => EpubMetadata) => {
        // Save current state to history before making changes
        setHistory(prev => {
            const newHistory = [...prev, { flatData: [...flatData], modifiedFiles: new Set(modifiedFiles) }]
            // Keep only last N states
            return newHistory.slice(-maxHistoryLength)
        })

        updateData(prev => {
            const newData = prev.map(item => {
                // Check if item is selected directly OR if its parent folder is selected
                // Note: selectedRowKeys can contain filePaths OR folder keys
                // But flatData only has files. We need to check if the file is effectively selected.
                // For simplicity, let's rely on flattened selected keys logic if we implement that,
                // OR check here.
                // Actually, AntD Tree Table selection: if parent selected, children are selected visually but keys might vary.
                // We will enforce that selectedRowKeys ONLY contains file paths for simplicity in logic,
                // OR we handle folder selection expansion here.

                // To make it robust:
                // Expand selection: if a folder key is in selectedRowKeys, treat all its children as selected.
                // But wait, AntD rowSelection with checkStrictly: false (default) automatically bubbles selection.
                // So selectedRowKeys will contain parent keys AND child keys.
                // We just need to check if item.filePath is in selectedRowKeys.

                if (selectedRowKeys.includes(item.filePath)) {
                    return updater(item)
                }
                return item
            })

            setModifiedFiles(prevMod => {
                const newMod = new Set(prevMod)
                newData.forEach(item => {
                    if (selectedRowKeys.includes(item.filePath)) {
                        const original = originalData.get(item.filePath)
                        if (checkIfModified(item, original)) {
                            newMod.add(item.filePath)
                        } else {
                            newMod.delete(item.filePath)
                        }
                    }
                })
                return newMod
            })

            return newData
        })
    }

    // Undo last batch operation
    const handleUndo = () => {
        if (history.length === 0) {
            message.info(t('app.noHistory'))
            return
        }

        const lastState = history[history.length - 1]
        setFlatData(lastState.flatData)
        setTreeData(buildTree(lastState.flatData, dirPath))
        setModifiedFiles(lastState.modifiedFiles)
        setHistory(prev => prev.slice(0, -1))
        message.success(t('app.undone'))
    }

    const applySeriesName = () => {
        batchUpdate(item => ({ ...item, series: newSeriesName }))
        setIsSeriesModalOpen(false)
        setNewSeriesName('')
    }

    const fillSeriesFromParent = () => {
        // Get all selected item paths (files use their filePath's directory, folders use their key path)
        const paths: string[] = []

        for (const key of selectedRowKeys) {
            if (typeof key === 'string') {
                if (key.startsWith('folder-')) {
                    paths.push(key.replace('folder-', ''))
                } else {
                    const item = flatData.find(f => f.filePath === key)
                    if (item) {
                        // For files, extract directory from filePath
                        const filePath = item.filePath.replace(/\\/g, '/')
                        const lastSlash = filePath.lastIndexOf('/')
                        if (lastSlash > 0) {
                            paths.push(filePath.substring(0, lastSlash))
                        }
                    }
                }
            }
        }


        if (paths.length === 0) return

        // Deduplicate paths
        const uniquePaths = [...new Set(paths)]

        // Filter to only top-level paths (paths that aren't children of other paths in the list)
        const topLevelPaths = uniquePaths.filter(path => {
            return !uniquePaths.some(other => {
                if (other === path) return false
                // Check if path is a child of other
                return path.startsWith(other + '/')
            })
        })


        if (topLevelPaths.length === 0) return

        // Find common parent of all top-level paths
        const splitPaths = topLevelPaths.map(p => p.split('/').filter(s => s))
        const minLength = Math.min(...splitPaths.map(p => p.length))

        let commonSegments: string[] = []
        for (let i = 0; i < minLength; i++) {
            const segment = splitPaths[0][i]
            if (splitPaths.every(p => p[i] === segment)) {
                commonSegments.push(segment)
            } else {
                break
            }
        }


        if (commonSegments.length === 0) return

        // Use the last segment of the common parent path
        const folderName = commonSegments[commonSegments.length - 1]
        setNewSeriesName(folderName)
    }

    const applyMajoritySeries = () => {
        // Find the most common series name among selected items
        const fileKeys = selectedRowKeys.filter(k => typeof k === 'string' && !k.startsWith('folder-'))
        const seriesCount = new Map<string, number>()

        for (const key of fileKeys) {
            const item = flatData.find(f => f.filePath === key)
            if (item && item.series) {
                seriesCount.set(item.series, (seriesCount.get(item.series) || 0) + 1)
            }
        }

        if (seriesCount.size === 0) return

        // Find the series with most occurrences
        let majoritySeries = ''
        let maxCount = 0
        for (const [series, count] of seriesCount.entries()) {
            if (count > maxCount) {
                maxCount = count
                majoritySeries = series
            }
        }

        if (majoritySeries) {
            setNewSeriesName(majoritySeries)
        }
    }

    const applyAutoIndex = () => {
        let currentIndex = 1
        batchUpdate(item => ({ ...item, seriesIndex: String(currentIndex++) }))
    }

    const applySmartContinue = () => {
        // Filter out folder keys, only keep file keys
        const fileKeys = selectedRowKeys.filter(k => typeof k === 'string' && !k.startsWith('folder-'))
        if (fileKeys.length === 0) return

        // Sort selected files based on their visual order (flat list order)
        // Since flatData is sorted by folder->file, this order is correct.
        const sortedSelectedItems = flatData.filter(item => fileKeys.includes(item.filePath))
        if (sortedSelectedItems.length === 0) return

        const firstItem = sortedSelectedItems[0]
        const firstVal = parseFloat(firstItem.seriesIndex) || 0
        let nextInt = Math.floor(firstVal) + 1

        const itemsToUpdate = new Set(sortedSelectedItems.slice(1).map(i => i.filePath))

        updateData(prev => {
            const newData = prev.map(item => {
                if (itemsToUpdate.has(item.filePath)) {
                    return { ...item, seriesIndex: String(nextInt++) }
                }
                return item
            })

            setModifiedFiles(prevMod => {
                const newMod = new Set(prevMod)
                newData.forEach(item => {
                    if (itemsToUpdate.has(item.filePath)) {
                        const original = originalData.get(item.filePath)
                        if (checkIfModified(item, original)) {
                            newMod.add(item.filePath)
                        } else {
                            newMod.delete(item.filePath)
                        }
                    }
                })
                return newMod
            })

            return newData
        })
    }

    // Helper to get all keys from tree (for SortableContext)
    const getAllTreeKeys = (nodes: DataNode[]): string[] => {
        const keys: string[] = []
        const traverse = (items: DataNode[]) => {
            items.forEach(node => {
                keys.push(node.key)
                if (node.children) traverse(node.children)
            })
        }
        traverse(nodes)
        return keys
    }

    // --- Drag and Drop ---
    const onDragEnd = ({ active, over }: DragEndEvent) => {
        if (active.id !== over?.id && over?.id) {
            // Find source and target files
            const sourceFile = flatData.find(f => f.filePath === active.id)
            const targetFile = flatData.find(f => f.filePath === over.id)

            // Only allow reordering within the same folder
            if (!sourceFile || !targetFile) return

            if (sourceFile.folderPath !== targetFile.folderPath) {
                message.warning(t('app.dragSameFolderOnly'))
                return
            }

            const activeIndex = flatData.findIndex((i) => i.filePath === active.id)
            const overIndex = flatData.findIndex((i) => i.filePath === over?.id)

            if (activeIndex !== -1 && overIndex !== -1) {
                const newData = arrayMove([...flatData], activeIndex, overIndex)
                setFlatData(newData)
                setTreeData(buildTree(newData, dirPath))
            }
        }
    }

    // --- Context Menu ---
    const getContextMenuItems = (): MenuProps['items'] => [
        {
            key: 'setSeries',
            label: t('app.contextMenu.setSeries'),
            icon: <Edit size={14} />,
            onClick: () => setIsSeriesModalOpen(true)
        },
        {
            type: 'divider'
        },
        {
            key: 'autoIndex',
            label: t('app.contextMenu.autoIndex'),
            icon: <ListOrdered size={14} />,
            onClick: applyAutoIndex
        },
        {
            key: 'smartIndex',
            label: t('app.contextMenu.smartIndex'),
            icon: <ArrowDown01 size={14} />,
            title: t('app.contextMenu.smartIndexTooltip'),
            onClick: applySmartContinue
        }
    ]

    // --- Row Click Handler ---
    const handleRowClick = (record: DataNode, event: React.MouseEvent) => {
        const key = record.key!

        if (event.shiftKey && lastSelectedKey) {
            // Get all keys from treeData in display order
            const getAllKeys = (nodes: DataNode[]): string[] => {
                const keys: string[] = []
                const traverse = (items: DataNode[]) => {
                    items.forEach(node => {
                        keys.push(node.key)
                        if (node.children) {
                            traverse(node.children)
                        }
                    })
                }
                traverse(nodes)
                return keys
            }

            const allKeys = getAllKeys(treeData)
            const lastIndex = allKeys.indexOf(lastSelectedKey)
            const currentIndex = allKeys.indexOf(key)

            if (lastIndex !== -1 && currentIndex !== -1) {
                const startIndex = Math.min(lastIndex, currentIndex)
                const endIndex = Math.max(lastIndex, currentIndex)
                const rangeKeys = allKeys.slice(startIndex, endIndex + 1)

                // Check if last selected key was selected or not to determine action
                const wasLastSelected = selectedRowKeys.includes(lastSelectedKey)

                if (wasLastSelected) {
                    // Select all in range
                    setSelectedRowKeys(prev => {
                        const newSet = new Set(prev)
                        rangeKeys.forEach(k => newSet.add(k))
                        return Array.from(newSet)
                    })
                } else {
                    // Deselect all in range
                    setSelectedRowKeys(prev => prev.filter(k => !rangeKeys.includes(k)))
                }
                return
            }
        }

        // Handle normal Toggle Select
        setLastSelectedKey(key)
        const selected = selectedRowKeys.includes(key)
        if (selected) {
            setSelectedRowKeys(prev => prev.filter(k => k !== key))
        } else {
            setSelectedRowKeys(prev => [...prev, key])
        }
    }

    return (
        <ConfigProvider
            theme={{
                algorithm: isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
                token: {
                    colorBgContainer: isDarkMode ? '#141414' : '#ffffff',
                    colorBgLayout: isDarkMode ? '#141414' : '#ffffff',
                }
            }}
        >
            <div
                style={{
                    padding: 20,
                    height: '100vh',
                    display: 'flex',
                    flexDirection: 'column',
                    backgroundColor: isDarkMode ? '#141414' : '#ffffff',
                    color: isDarkMode ? '#ffffff' : '#000000',
                    transition: 'all 0.3s',
                    boxSizing: 'border-box'
                }}
            >
                <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <Button type="primary" onClick={handleSelectDir} loading={loading}>
                            {t('app.openFolder')}
                        </Button>

                        <Button
                            type="primary"
                            icon={<Save size={16} />}
                            onClick={handleSave}
                            loading={saving}
                            disabled={modifiedFiles.size === 0}
                            style={{ backgroundColor: modifiedFiles.size > 0 ? '#52c41a' : undefined }}
                        >
                            {t('app.save')}
                        </Button>

                        <Button
                            icon={<Undo2 size={16} />}
                            onClick={handleUndo}
                            disabled={history.length === 0}
                            title={t('app.batch.undo')}
                        >
                            {t('app.batch.undo')}
                        </Button>

                        <Checkbox checked={backup} onChange={e => setBackup(e.target.checked)}>
                            {t('app.backup')}
                        </Checkbox>
                        <Checkbox checked={writeEpub3} onChange={e => setWriteEpub3(e.target.checked)}>
                            {t('app.formatEpub3')}
                        </Checkbox>
                        <Checkbox checked={writeCalibre} onChange={e => setWriteCalibre(e.target.checked)}>
                            {t('app.formatCalibre')}
                        </Checkbox>
                    </div>

                    <Space>
                        <Select
                            defaultValue={i18n.language}
                            onChange={(val) => i18n.changeLanguage(val)}
                            options={[
                                { value: 'zh-CN', label: '中文' },
                                { value: 'en-US', label: 'English' }
                            ]}
                            style={{ width: 100 }}
                        />
                        <Button
                            icon={isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
                            onClick={() => setIsDarkMode(!isDarkMode)}
                            title={t('app.theme.toggle')}
                        />
                    </Space>
                </div>

                <div style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'center', opacity: 0.7, fontSize: 12 }}>
                    <Checkbox checked={recursive} onChange={handleRecursiveChange}>
                        {t('app.recursive')}
                    </Checkbox>
                    <span>|</span>
                    <span>{dirPath || t('app.noFolderSelected')}</span>
                    {modifiedFiles.size > 0 && (
                        <span style={{ color: '#1890ff' }}>({modifiedFiles.size} changes pending)</span>
                    )}
                </div>

                <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                    <DndContext
                        sensors={sensors}
                        modifiers={[restrictToVerticalAxis]}
                        collisionDetection={closestCenter}
                        onDragEnd={onDragEnd}
                    >
                        <SortableContext items={getAllTreeKeys(treeData)} strategy={verticalListSortingStrategy}>
                            <Dropdown menu={{ items: getContextMenuItems() }} trigger={['contextMenu']}>
                                <Table
                                    components={{
                                        header: {
                                            cell: ResizableTitle,
                                        },
                                        body: {
                                            row: Row,
                                        },
                                    }}
                                    columns={mergedColumns}
                                    dataSource={treeData}
                                    rowKey="key"
                                    pagination={false}
                                    scroll={{ y: 'calc(100vh - 180px)' }}
                                    size="small"
                                    bordered
                                    expandable={{
                                        defaultExpandAllRows: true,
                                    }}
                                    style={{ height: '100%' }}
                                    rowSelection={{
                                        type: 'checkbox',
                                        selectedRowKeys,
                                        checkStrictly: false, // Enable cascading selection for folders
                                        onChange: (keys) => {
                                            setSelectedRowKeys(keys)
                                            if (keys.length > 0) {
                                                setLastSelectedKey(keys[keys.length - 1] as string)
                                            }
                                        }
                                    }}
                                    onRow={(record) => ({
                                        // @ts-ignore
                                        'data-row-key': record.key,
                                        className: `tree-row-depth-${Math.min(record.depth || 0, 5)}`,
                                        onClick: (event) => handleRowClick(record, event),
                                        onContextMenu: (event) => {
                                            if (!selectedRowKeys.includes(record.key!)) {
                                                setSelectedRowKeys([record.key!])
                                                setLastSelectedKey(record.key!)
                                            }
                                        }
                                    })}
                                />
                            </Dropdown>
                        </SortableContext>
                    </DndContext>

                    {/* Floating Batch Action Bar */}
                    {selectedRowKeys.length > 0 && (
                        <div style={{
                            position: 'absolute',
                            bottom: 20,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            zIndex: 100,
                            width: 'auto',
                            minWidth: 400
                        }}>
                            <Card
                                size="small"
                                bodyStyle={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 6px 16px -8px rgba(0,0,0,0.08), 0 9px 28px 0 rgba(0,0,0,0.05), 0 12px 48px 16px rgba(0,0,0,0.03)' }}
                            >
                                <span style={{ fontWeight: 500 }}>{t('app.batch.selected', { count: selectedRowKeys.filter(k => !String(k).startsWith('folder-')).length })}</span>
                                <div style={{ width: 1, height: 20, background: '#f0f0f0' }} />
                                <Space>
                                    <Button size="small" icon={<Edit size={14} />} onClick={() => setIsSeriesModalOpen(true)}>
                                        {t('app.batch.setSeries')}
                                    </Button>
                                    <Button size="small" icon={<ListOrdered size={14} />} onClick={applyAutoIndex}>
                                        {t('app.batch.autoIndex')}
                                    </Button>
                                    <Button size="small" icon={<ArrowDown01 size={14} />} onClick={applySmartContinue}>
                                        {t('app.batch.smartIndex')}
                                    </Button>
                                    <Button size="small" type="text" icon={<X size={14} />} onClick={() => setSelectedRowKeys([])} />
                                </Space>
                            </Card>
                        </div>
                    )}
                </div>

                <Modal
                    title={t('app.modal.enterSeries')}
                    open={isSeriesModalOpen}
                    onOk={applySeriesName}
                    onCancel={() => setIsSeriesModalOpen(false)}
                    okText={t('app.modal.ok')}
                    cancelText={t('app.modal.cancel')}
                >
                    <Space direction="vertical" style={{ width: '100%' }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <Input
                                value={newSeriesName}
                                onChange={e => setNewSeriesName(e.target.value)}
                                placeholder="Series Name"
                                autoFocus
                            />
                            <Button
                                icon={<FolderInput size={16} />}
                                onClick={fillSeriesFromParent}
                                title={t('app.modal.useParentDir')}
                            />
                            <Button
                                icon={<Wand2 size={16} />}
                                onClick={applyMajoritySeries}
                                title={t('app.modal.useMajority')}
                            />
                        </div>
                    </Space>
                </Modal>
            </div>
        </ConfigProvider>
    )
}

export default App
