'use client'

import { Handle, Position, type NodeProps } from '@xyflow/react'

const typeIcons: Record<string, string> = {
  input: '📷',
  ai_agent: '🤖',
  python_worker: '🐍',
  splitter: '✂️',
  merger: '🔗',
  export: '📦',
  image_gen: '🎨',
  validator: '✅',
  custom: '⚙️',
}

export function PipelineNode({ data, selected }: NodeProps) {
  const { label, description, nodeType, color, enabled } = data as {
    label: string
    description: string
    nodeType: string
    color: string
    enabled: boolean
  }

  return (
    <div
      className={`min-w-[170px] rounded-lg border-2 bg-[#1e1e2e] shadow-lg transition-all ${
        selected ? 'border-purple-500 shadow-purple-500/20' : 'border-gray-700'
      } ${!enabled ? 'opacity-50' : ''}`}
    >
      {/* Input handle */}
      {nodeType !== 'input' && (
        <Handle
          type="target"
          position={Position.Left}
          className="!h-3 !w-3 !rounded-full !border-2 !border-gray-600 !bg-gray-400"
        />
      )}

      {/* Header */}
      <div className="flex items-center gap-2 border-b border-gray-700/50 px-3 py-2">
        <div
          className="flex h-6 w-6 items-center justify-center rounded text-xs"
          style={{ backgroundColor: color + '22', color }}
        >
          {typeIcons[nodeType] ?? '⚙️'}
        </div>
        <div className="flex-1 text-xs font-semibold text-white">{label}</div>
        <div
          className={`h-2 w-2 rounded-full ${enabled ? 'bg-green-400' : 'bg-gray-600'}`}
          title={enabled ? 'Activo' : 'Desactivado'}
        />
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        <p className="text-[10px] leading-relaxed text-gray-400">{description}</p>
        {selected && (
          <p className="mt-1 text-[10px] text-purple-400">Click para configurar →</p>
        )}
      </div>

      {/* Output handle */}
      {nodeType !== 'export' && (
        <Handle
          type="source"
          position={Position.Right}
          className="!h-3 !w-3 !rounded-full !border-2 !border-gray-600 !bg-gray-400"
        />
      )}
    </div>
  )
}
