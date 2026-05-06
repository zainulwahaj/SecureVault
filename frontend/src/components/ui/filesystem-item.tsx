"use client"

import { useState } from "react"
import { ChevronRight, Folder, File } from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"
import { cn } from "@/lib/utils"

export type FileNode = {
  id: string
  name: string
  type: 'folder' | 'file'
  mimeType?: string
  size?: number
  nodes?: FileNode[]
}

interface FilesystemItemProps {
  node: FileNode
  animated?: boolean
  depth?: number
  selected?: string | null
  onSelect?: (node: FileNode) => void
  onDoubleClick?: (node: FileNode) => void
  onDragStartNode?: (e: React.DragEvent, node: FileNode) => void
  onDropOnFolder?: (e: React.DragEvent, folderId: string) => void
  dropTargetId?: string | null
  className?: string
}

export function FilesystemItem({
  node,
  animated = true,
  depth = 0,
  selected,
  onSelect,
  onDoubleClick,
  onDragStartNode,
  onDropOnFolder,
  dropTargetId,
  className,
}: FilesystemItemProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const isFolder = node.type === 'folder'
  const isSelected = selected === node.id
  const hasChildren = isFolder && node.nodes && node.nodes.length > 0

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onSelect?.(node)
    if (isFolder) setIsOpen(!isOpen)
  }

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onDoubleClick?.(node)
  }

  const handleDragStart = (e: React.DragEvent) => {
    e.stopPropagation()
    onDragStartNode?.(e, node)
  }

  const handleDragOver = (e: React.DragEvent) => {
    if (isFolder) {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(true)
    }
  }

  const handleDragLeave = () => setIsDragOver(false)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    if (isFolder) {
      onDropOnFolder?.(e, node.id)
      if (!isOpen) setIsOpen(true)
    }
  }

  return (
    <li className={cn("select-none", className)}>
      <div
        draggable={node.type === 'file'}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "flex items-center gap-1.5 py-1.5 px-2 rounded-lg cursor-pointer transition-colors",
          isSelected
            ? "bg-primary/10 text-primary"
            : "hover:bg-muted text-foreground",
          isDragOver && isFolder && "ring-2 ring-primary bg-primary/5"
        )}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      >
        {isFolder ? (
          animated ? (
            <motion.span
              animate={{ rotate: isOpen ? 90 : 0 }}
              transition={{ type: "spring", bounce: 0, duration: 0.4 }}
              className="flex shrink-0"
            >
              <ChevronRight className="size-4 text-muted-foreground" />
            </motion.span>
          ) : (
            <ChevronRight
              className={cn(
                "size-4 text-muted-foreground shrink-0 transition-transform",
                isOpen && "rotate-90"
              )}
            />
          )
        ) : (
          <span className="w-4 shrink-0" />
        )}

        {isFolder ? (
          <Folder className="size-5 text-blue-500 fill-blue-500/20 shrink-0" />
        ) : (
          <File className="size-5 text-muted-foreground shrink-0" />
        )}

        <span className="text-sm truncate">{node.name}</span>
      </div>

      {hasChildren && animated ? (
        <AnimatePresence>
          {isOpen && (
            <motion.ul
              initial={{ height: 0 }}
              animate={{ height: "auto" }}
              exit={{ height: 0 }}
              transition={{ type: "spring", bounce: 0, duration: 0.4 }}
              className="overflow-hidden"
            >
              {node.nodes!.map((child) => (
                <FilesystemItem
                  key={child.id}
                  node={child}
                  animated={animated}
                  depth={depth + 1}
                  selected={selected}
                  onSelect={onSelect}
                  onDoubleClick={onDoubleClick}
                  onDragStartNode={onDragStartNode}
                  onDropOnFolder={onDropOnFolder}
                  dropTargetId={dropTargetId}
                />
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      ) : (
        hasChildren &&
        isOpen && (
          <ul>
            {node.nodes!.map((child) => (
              <FilesystemItem
                key={child.id}
                node={child}
                animated={animated}
                depth={depth + 1}
                selected={selected}
                onSelect={onSelect}
                onDoubleClick={onDoubleClick}
                onDragStartNode={onDragStartNode}
                onDropOnFolder={onDropOnFolder}
                dropTargetId={dropTargetId}
              />
            ))}
          </ul>
        )
      )}
    </li>
  )
}
