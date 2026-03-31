'use client'

import { type Node } from '@xyflow/react'

interface NodeConfigPanelProps {
  node: Node
  onConfigChange: (nodeId: string, config: Record<string, unknown>) => void
  onToggleEnabled: (nodeId: string) => void
  onClose: () => void
}

export function NodeConfigPanel({ node, onConfigChange, onToggleEnabled, onClose }: NodeConfigPanelProps) {
  const { label, description, nodeType, enabled, config } = node.data as {
    label: string
    description: string
    nodeType: string
    enabled: boolean
    config: Record<string, unknown>
  }

  const updateConfig = (key: string, value: unknown) => {
    onConfigChange(node.id, { ...config, [key]: value })
  }

  return (
    <div className="flex w-96 flex-col border-l border-gray-800 bg-[#1a1a2e]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-white">{label}</h3>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Toggle */}
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
        <span className="text-xs text-gray-400">Nodo activo</span>
        <button
          onClick={() => onToggleEnabled(node.id)}
          className={`h-6 w-11 rounded-full transition-colors ${enabled ? 'bg-green-500' : 'bg-gray-600'}`}
        >
          <div
            className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
              enabled ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {/* Config fields */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* AI Agent config */}
        {nodeType === 'ai_agent' && (
          <>
            <Field label="Modelo IA">
              <select
                value={(config.model as string) ?? 'gpt-4o'}
                onChange={(e) => updateConfig('model', e.target.value)}
                className="w-full rounded-md border border-gray-700 bg-[#12121f] px-3 py-2 text-sm text-white"
              >
                <option value="gpt-4o">GPT-4o (recomendado)</option>
                <option value="gpt-4o-mini">GPT-4o Mini (rapido)</option>
                <option value="gpt-4.1">GPT-4.1</option>
                <option value="claude-3.5-sonnet">Claude 3.5 Sonnet</option>
                <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
              </select>
            </Field>
            <Field label="Max tokens">
              <input
                type="number"
                value={(config.max_tokens as number) ?? 500}
                onChange={(e) => updateConfig('max_tokens', parseInt(e.target.value))}
                className="w-full rounded-md border border-gray-700 bg-[#12121f] px-3 py-2 text-sm text-white"
              />
            </Field>
            <Field label="Prompt">
              <textarea
                value={(config.prompt as string) ?? ''}
                onChange={(e) => updateConfig('prompt', e.target.value)}
                rows={12}
                className="w-full rounded-md border border-gray-700 bg-[#12121f] px-3 py-2 font-mono text-xs text-gray-300 leading-relaxed"
              />
            </Field>
            <div className="rounded-md bg-gray-800/50 p-2">
              <p className="text-[10px] text-gray-500">
                Variables disponibles: {'{surface}'}, {'{hoop_size}'}, {'{machine_brand}'}, {'{hoop_width}'}, {'{hoop_height}'}
              </p>
            </div>
          </>
        )}

        {/* Python worker config */}
        {nodeType === 'python_worker' && (
          <>
            <Field label="Perfil de tela">
              <select
                value={(config.profile as string) ?? 'auto'}
                onChange={(e) => updateConfig('profile', e.target.value)}
                className="w-full rounded-md border border-gray-700 bg-[#12121f] px-3 py-2 text-sm text-white"
              >
                <option value="auto">Auto (segun superficie)</option>
                <option value="shirt">Camisa / Algodon</option>
                <option value="cap">Gorra</option>
                <option value="jacket">Chamarra / Sudadera</option>
                <option value="patch">Parche</option>
                <option value="other">Generico</option>
              </select>
            </Field>
            <Field label="Umbral TRIM (mm)">
              <input
                type="number"
                value={(config.trim_threshold_mm as number) ?? 3.0}
                onChange={(e) => updateConfig('trim_threshold_mm', parseFloat(e.target.value))}
                step={0.5}
                min={1}
                max={15}
                className="w-full rounded-md border border-gray-700 bg-[#12121f] px-3 py-2 text-sm text-white"
              />
            </Field>
            <Field label="Tie-in puntadas">
              <input
                type="number"
                value={(config.tie_in_stitches as number) ?? 3}
                onChange={(e) => updateConfig('tie_in_stitches', parseInt(e.target.value))}
                min={2}
                max={5}
                className="w-full rounded-md border border-gray-700 bg-[#12121f] px-3 py-2 text-sm text-white"
              />
            </Field>
          </>
        )}

        {/* Splitter config */}
        {nodeType === 'splitter' && (
          <Field label="Metodo de separacion">
            <select
              value={(config.method as string) ?? 'color_and_shape'}
              onChange={(e) => updateConfig('method', e.target.value)}
              className="w-full rounded-md border border-gray-700 bg-[#12121f] px-3 py-2 text-sm text-white"
            >
              <option value="color">Solo por color</option>
              <option value="shape">Solo por forma</option>
              <option value="color_and_shape">Color + Forma (recomendado)</option>
            </select>
          </Field>
        )}

        {/* Merger config */}
        {nodeType === 'merger' && (
          <>
            <Field label="Secuenciacion">
              <select
                value={(config.sequencing as string) ?? 'auto'}
                onChange={(e) => updateConfig('sequencing', e.target.value)}
                className="w-full rounded-md border border-gray-700 bg-[#12121f] px-3 py-2 text-sm text-white"
              >
                <option value="auto">Auto (fills → satins → contornos)</option>
                <option value="manual">Manual (orden de capas)</option>
                <option value="concentric">Concentrico (gorra)</option>
              </select>
            </Field>
            <Field label="Orden de colores">
              <select
                value={(config.color_order as string) ?? 'light_first'}
                onChange={(e) => updateConfig('color_order', e.target.value)}
                className="w-full rounded-md border border-gray-700 bg-[#12121f] px-3 py-2 text-sm text-white"
              >
                <option value="light_first">Claros primero</option>
                <option value="dark_first">Oscuros primero</option>
                <option value="manual">Manual</option>
              </select>
            </Field>
          </>
        )}

        {/* Export config */}
        {nodeType === 'export' && (
          <Field label="Formato de salida">
            <select
              value={(config.format as string) ?? 'auto'}
              onChange={(e) => updateConfig('format', e.target.value)}
              className="w-full rounded-md border border-gray-700 bg-[#12121f] px-3 py-2 text-sm text-white"
            >
              <option value="auto">Auto (segun maquina)</option>
              <option value="DST">DST (Tajima)</option>
              <option value="PES">PES (Brother)</option>
              <option value="JEF">JEF (Janome)</option>
              <option value="EXP">EXP (Melco)</option>
              <option value="VIP">VIP (Pfaff)</option>
            </select>
          </Field>
        )}

        {/* Input node */}
        {nodeType === 'input' && (
          <p className="text-xs text-gray-500">
            Este nodo recibe la imagen que el cliente sube. No tiene configuracion.
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-800 p-4">
        <p className="text-[10px] text-gray-600">
          Tipo: {nodeType} · ID: {node.id}
        </p>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-gray-400">{label}</label>
      {children}
    </div>
  )
}
