'use client'

import { useCallback, useState } from 'react'
import {
  ReactFlow,
  addEdge,
  useNodesState,
  useEdgesState,
  Background,
  Controls,
  MiniMap,
  Panel,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { PipelineNode } from '@/components/admin/pipeline-node'
import { NodeConfigPanel } from '@/components/admin/node-config-panel'

const nodeTypes: NodeTypes = {
  pipeline: PipelineNode,
}

const initialNodes: Node[] = [
  {
    id: 'input',
    type: 'pipeline',
    position: { x: 0, y: 200 },
    data: {
      label: 'Imagen',
      description: 'Cliente sube imagen',
      nodeType: 'input',
      color: '#22c55e',
      enabled: true,
      config: {},
    },
  },
  {
    id: 'f1-analyze',
    type: 'pipeline',
    position: { x: 250, y: 80 },
    data: {
      label: 'F1: Analisis IA',
      description: 'GPT-4o analiza imagen',
      nodeType: 'ai_agent',
      color: '#22c55e',
      enabled: true,
      config: {
        model: 'gpt-4o',
        max_tokens: 500,
        prompt: `Eres un experto en bordado industrial. Analiza esta imagen que un cliente quiere convertir en un diseno de bordado para una {surface}.

Configuracion del proyecto:
- Superficie: {surface}
- Tamano del aro: {hoop_size}
- Maquina: {machine_brand}

Responde UNICAMENTE con un JSON con esta estructura exacta:
{
  "brief": "Descripcion en lenguaje simple de lo que entendiste",
  "elements_to_keep": ["elemento1"],
  "elements_to_discard": ["fondo"],
  "estimated_thread_colors": 3,
  "image_quality": "good",
  "complexity": "simple",
  "warnings": []
}`,
      },
    },
  },
  {
    id: 'f2-extract',
    type: 'pipeline',
    position: { x: 250, y: 300 },
    data: {
      label: 'F2: Extraccion',
      description: 'Segmentar / Skip',
      nodeType: 'python_worker',
      color: '#f59e0b',
      enabled: false,
      config: { method: 'skip' },
    },
  },
  {
    id: 'f3-prepare',
    type: 'pipeline',
    position: { x: 500, y: 190 },
    data: {
      label: 'F3: Digitalizador IA',
      description: 'Asigna puntadas y colores',
      nodeType: 'ai_agent',
      color: '#3b82f6',
      enabled: true,
      config: {
        model: 'gpt-4o',
        max_tokens: 1000,
        prompt: `Eres un experto digitalizador de bordado. Analiza este diseno y genera los parametros de digitalizacion.

Reglas:
- Textos y bordes finos: satin
- Rellenos grandes (>10mm): tatami
- Contornos: running
- color_hex DEBE coincidir con el color REAL

Responde UNICAMENTE con JSON...`,
      },
    },
  },
  {
    id: 'split-layers',
    type: 'pipeline',
    position: { x: 750, y: 190 },
    data: {
      label: 'Separar en Capas',
      description: 'Por color + forma',
      nodeType: 'splitter',
      color: '#f59e0b',
      enabled: true,
      config: { method: 'color_and_shape' },
    },
  },
  {
    id: 'process-layers',
    type: 'pipeline',
    position: { x: 1000, y: 190 },
    data: {
      label: 'Procesar Capas',
      description: 'Motor Python v4 por capa',
      nodeType: 'python_worker',
      color: '#ef4444',
      enabled: true,
      config: {
        profile: 'auto',
        trim_threshold_mm: 3.0,
        tie_in_stitches: 3,
      },
    },
  },
  {
    id: 'merge-layers',
    type: 'pipeline',
    position: { x: 1250, y: 190 },
    data: {
      label: 'Unir Capas',
      description: 'Ordena + TRIM + Valida',
      nodeType: 'merger',
      color: '#8b5cf6',
      enabled: true,
      config: { sequencing: 'auto', color_order: 'light_first' },
    },
  },
  {
    id: 'export',
    type: 'pipeline',
    position: { x: 1500, y: 190 },
    data: {
      label: 'Exportar',
      description: 'pyembroidery → .DST/.PES',
      nodeType: 'export',
      color: '#22c55e',
      enabled: true,
      config: { format: 'auto' },
    },
  },
]

const initialEdges: Edge[] = [
  { id: 'e-input-f1', source: 'input', target: 'f1-analyze', animated: true, style: { stroke: '#555' } },
  { id: 'e-input-f2', source: 'input', target: 'f2-extract', animated: false, style: { stroke: '#333' } },
  { id: 'e-f1-f3', source: 'f1-analyze', target: 'f3-prepare', animated: true, style: { stroke: '#555' } },
  { id: 'e-f2-f3', source: 'f2-extract', target: 'f3-prepare', animated: false, style: { stroke: '#333' } },
  { id: 'e-f3-split', source: 'f3-prepare', target: 'split-layers', animated: true, style: { stroke: '#555' } },
  { id: 'e-split-proc', source: 'split-layers', target: 'process-layers', animated: true, style: { stroke: '#f59e0b' } },
  { id: 'e-proc-merge', source: 'process-layers', target: 'merge-layers', animated: true, style: { stroke: '#ef4444' } },
  { id: 'e-merge-export', source: 'merge-layers', target: 'export', animated: true, style: { stroke: '#8b5cf6' } },
]

export default function PipelineEditorPage() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge({ ...connection, animated: true, style: { stroke: '#555' } }, eds)),
    [setEdges],
  )

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node)
  }, [])

  const onPaneClick = useCallback(() => {
    setSelectedNode(null)
  }, [])

  const onConfigChange = useCallback(
    (nodeId: string, newConfig: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === nodeId) {
            return { ...n, data: { ...n.data, config: newConfig } }
          }
          return n
        }),
      )
      if (selectedNode && selectedNode.id === nodeId) {
        setSelectedNode((prev) => prev ? { ...prev, data: { ...prev.data, config: newConfig } } : null)
      }
    },
    [setNodes, selectedNode],
  )

  const onToggleEnabled = useCallback(
    (nodeId: string) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === nodeId) {
            return { ...n, data: { ...n.data, enabled: !n.data.enabled } }
          }
          return n
        }),
      )
    },
    [setNodes],
  )

  return (
    <div className="flex h-screen">
      {/* Canvas */}
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          fitView
          className="bg-[#12121f]"
          defaultEdgeOptions={{ type: 'smoothstep' }}
        >
          <Background color="#222" gap={20} size={1} />
          <Controls className="[&>button]:bg-[#1e1e2e] [&>button]:border-gray-700 [&>button]:text-white" />
          <MiniMap
            className="bg-[#1e1e2e] [&>svg]:rounded-lg"
            nodeColor={(n) => (n.data as Record<string, string>).color ?? '#555'}
            maskColor="rgba(0,0,0,0.7)"
          />
          <Panel position="top-left">
            <div className="rounded-lg bg-[#1a1a2e] px-4 py-2 text-sm text-white shadow-lg">
              <span className="font-semibold">Pipeline Editor</span>
              <span className="ml-2 text-xs text-gray-400">Click en un nodo para configurar</span>
            </div>
          </Panel>
        </ReactFlow>
      </div>

      {/* Config Panel */}
      {selectedNode && (
        <NodeConfigPanel
          node={selectedNode}
          onConfigChange={onConfigChange}
          onToggleEnabled={onToggleEnabled}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  )
}
