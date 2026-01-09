import { useState, useEffect, useMemo, createContext, useContext } from 'react'
import { Button, Table, message, Checkbox, ConfigProvider, theme, Space, Select, Input, Modal, Dropdown, MenuProps, Card } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useTranslation } from 'react-i18next'
import { Moon, Sun, Save, ListOrdered, Edit, ArrowDown01, X, FolderInput, GripVertical, Folder, FolderOpen } from 'lucide-react'
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
  cover?: string
}

// Tree Node Type
interface DataNode extends Partial<EpubMetadata> {
    key: string
    isFolder: boolean
    children?: DataNode[]
    fileCount?: number
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

const DragHandle = () => {
  const { attributes, listeners, setActivatorNodeRef } = useContext(RowContext)
  // If no listeners (disabled), don't show grab cursor
  const cursor = listeners ? 'grab' : 'default'
  const color = listeners ? '#999' : 'transparent'
  
  return (
    <div ref={setActivatorNodeRef} {...attributes} {...listeners} style={{ cursor, display: 'flex', alignItems: 'center', height: '100%', outline: 'none' }}>
      <GripVertical size={16} color={color} />
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
  
  // Selection state
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [lastSelectedKey, setLastSelectedKey] = useState<string | null>(null)

  // Column widths state
  const [columns, setColumns] = useState<any[]>([])

  // Modal state
  const [isSeriesModalOpen, setIsSeriesModalOpen] = useState(false)
  const [newSeriesName, setNewSeriesName] = useState('')

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
                // render: (_, record) => !record.isFolder && <DragHandle />,
                render: () => null, // Hide drag handle temporarily
            },
            {
              title: t('app.table.filename'),
              dataIndex: 'fileName',
              key: 'fileName',
              width: getWidth('fileName', 300),
              render: (text, record) => {
                  if (record.isFolder) {
                      return (
                          <span style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 6 }}>
                              <FolderOpen size={16} /> {record.folderPath} <span style={{ opacity: 0.5, fontSize: 12 }}>({record.fileCount})</span>
                          </span>
                      )
                  }
                  return text
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
                  <Input 
                     value={text} 
                     onChange={e => handleDataChange(record.filePath!, 'series', e.target.value)}
                     onClick={(e) => e.stopPropagation()}
                     bordered={false}
                     style={{ padding: '0 4px', background: modifiedFiles.has(record.filePath!) ? 'rgba(24, 144, 255, 0.1)' : undefined }}
                  />
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
                render: (_, record) => !record.isFolder && modifiedFiles.has(record.filePath!) ? <div style={{width: 6, height: 6, borderRadius: '50%', background: '#1890ff'}} /> : null
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

      const getFolderNode = (parentArr: DataNode[], fullPath: string, folderName: string): DataNode => {
          const key = `folder-${fullPath}`
          if (folderMap.has(fullPath)) return folderMap.get(fullPath)!
          
          const newNode: DataNode = {
              key,
              isFolder: true,
              folderPath: folderName, // This is used for display in the Name column
              children: [],
              fileCount: 0
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
          for (let i = 0; i < parts.length - 1; i++) {
              const part = parts[i]
              currentPath = `${currentPath}/${part}`
              
              const folderNode = getFolderNode(currentLevel, currentPath, part)
              folderNode.fileCount = (folderNode.fileCount || 0) + 1
              currentLevel = folderNode.children!
          }
          
          // Add file
          currentLevel.push({
              ...f,
              key: f.filePath,
              isFolder: false
          })
      })

      // Recursive sort
      const sortNodes = (nodes: DataNode[]) => {
          nodes.sort((a, b) => {
              if (a.isFolder && !b.isFolder) return -1
              if (!a.isFolder && b.isFolder) return 1
              const nameA = a.isFolder ? a.folderPath : a.fileName
              const nameB = b.isFolder ? b.folderPath : b.fileName
              return (nameA || '').localeCompare(nameB || '', undefined, { numeric: true })
          })
          nodes.forEach(n => {
              if (n.children) sortNodes(n.children)
          })
      }
      
      sortNodes(root)
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
      return item.series !== original.series || item.seriesIndex !== original.seriesIndex
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
              const res = await window.api.saveEpub(file.filePath, file.series, file.seriesIndex, backup)
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

  const applySeriesName = () => {
      batchUpdate(item => ({ ...item, series: newSeriesName }))
      setIsSeriesModalOpen(false)
      setNewSeriesName('')
  }
  
  const fillSeriesFromParent = () => {
      // Find first selected FILE
      const firstKey = selectedRowKeys.find(k => typeof k === 'string' && !k.startsWith('folder-'))
      if (firstKey) {
          const firstSelected = flatData.find(item => item.filePath === firstKey)
          if (firstSelected) {
              setNewSeriesName(firstSelected.folderPath)
          }
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

  // --- Drag and Drop ---
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (active.id !== over?.id) {
        // Dragging in Tree View is complex.
        // We only allow dragging FILES.
        // And we only allow reordering within the flat list logic.
        // But the Tree View is derived from flat list grouped by folder.
        // If we change order in flat list, it might not affect Tree View if Tree View is strictly grouping by folder name.
        // Unless we change the FOLDER of the file? No, user just wants to reorder index.
        // Reordering in "Tree View" usually implies changing the order of children.
        
        // Strategy:
        // 1. Find source and target in flatData
        // 2. arrayMove flatData
        // 3. Rebuild Tree
        
        // Note: If we move a file to a position that belongs to another folder in the flat list...
        // The buildTree function groups by folder path string.
        // So simply reordering the flat array won't change the visual grouping if buildTree iterates and groups.
        // buildTree logic: groups.set(key, []).push(f).
        // This implies the order WITHIN the group is preserved from the flat list.
        // So yes, arrayMove on flatData works for reordering files WITHIN a folder.
        // Moving a file "visually" to another folder via drag would require changing its folderPath property.
        // For now, let's assume dragging is for sorting.
        
      setFlatData((previous) => {
        const activeIndex = previous.findIndex((i) => i.filePath === active.id)
        const overIndex = previous.findIndex((i) => i.filePath === over?.id)
        
        // If dragging across folders, we might need to update folderPath to match target?
        // Let's implement that: if you drop a file into another folder's area, it adopts that folder.
        // But for metadata editor, usually we just want to sort order for numbering.
        // Changing folder physically on disk is out of scope?
        // Or maybe just changing the 'grouping' visually?
        // Let's stick to simple reorder.
        
        const newData = arrayMove(previous, activeIndex, overIndex)
        setTreeData(buildTree(newData))
        return newData
      })
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
          // Shift select logic for Tree is tricky.
          // We can use the flat list of keys visible?
          // For simplicity, let's iterate the treeData in order (flattened visually)
          // Actually, let's just use flatData for range finding if both are files.
          // If folders involved, it gets complicated.
          // Fallback to simple toggle for now or implement flattened view search.
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
                    icon={<Save size={16}/>} 
                    onClick={handleSave} 
                    loading={saving}
                    disabled={modifiedFiles.size === 0}
                    style={{ backgroundColor: modifiedFiles.size > 0 ? '#52c41a' : undefined }}
                >
                    {t('app.save')}
                </Button>

                <Checkbox checked={backup} onChange={e => setBackup(e.target.checked)}>
                    {t('app.backup')}
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
                    icon={isDarkMode ? <Sun size={16}/> : <Moon size={16}/>} 
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
                <SortableContext items={flatData.map((i) => i.filePath)} strategy={verticalListSortingStrategy}>
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
                        <span style={{ fontWeight: 500 }}>{t('app.batch.selected', {count: selectedRowKeys.filter(k => !String(k).startsWith('folder-')).length})}</span>
                        <div style={{ width: 1, height: 20, background: '#f0f0f0' }} />
                        <Space>
                            <Button size="small" icon={<Edit size={14}/>} onClick={() => setIsSeriesModalOpen(true)}>
                                {t('app.batch.setSeries')}
                            </Button>
                            <Button size="small" icon={<ListOrdered size={14}/>} onClick={applyAutoIndex}>
                                {t('app.batch.autoIndex')}
                            </Button>
                            <Button size="small" icon={<ArrowDown01 size={14}/>} onClick={applySmartContinue}>
                                {t('app.batch.smartIndex')}
                            </Button>
                            <Button size="small" type="text" icon={<X size={14}/>} onClick={() => setSelectedRowKeys([])} />
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
                        icon={<FolderInput size={16}/>} 
                        onClick={fillSeriesFromParent}
                        title={t('app.modal.useParentDir')}
                     />
                 </div>
             </Space>
         </Modal>
      </div>
    </ConfigProvider>
  )
}

export default App
