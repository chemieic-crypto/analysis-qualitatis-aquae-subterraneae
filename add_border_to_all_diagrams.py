import re

print("Starting to add outer frame border facility to Piper, USSL, Chadha, and Gibbs diagrams...")

# =============================================================================
# 1. PIPER DIAGRAM
# =============================================================================
with open("src/components/PiperDiagram.tsx", "r") as f:
    piper = f.read()

# Add import
import_marker = 'import { DiagramToolbarStudio, SimpleTitleEditorModal } from "./DiagramToolbarStudio";'
assert import_marker in piper, "import_marker not found in PiperDiagram.tsx"
piper = piper.replace(
    import_marker,
    import_marker + '\nimport DiagramBorderEditor, { DiagramBorderConfig, DEFAULT_PIPER_BORDER_CONFIG } from "./DiagramBorderEditor";',
    1
)

# Add state
state_marker = '  const [showProjectionLines, setShowProjectionLines] = useState<boolean>(false);'
assert state_marker in piper, "state_marker not found in PiperDiagram.tsx"
piper = piper.replace(
    state_marker,
    state_marker + '\n  const [borderConfig, setBorderConfig] = useState<DiagramBorderConfig>(DEFAULT_PIPER_BORDER_CONFIG);\n  const [editingBorder, setEditingBorder] = useState<boolean>(false);',
    1
)

# Update applyReferenceTemplate to set borderConfig
ref_marker = '    setLegendPos(DEFAULT_LEGEND_POS);'
assert ref_marker in piper, "ref_marker not found in PiperDiagram.tsx"
piper = piper.replace(
    ref_marker,
    ref_marker + '\n    setBorderConfig({\n      show: true,\n      color: "#2d2711",\n      thickness: 3.5,\n      style: "solid",\n      radius: 0,\n      padding: 8\n    });',
    1
)

# Pass props to DiagramToolbarStudio
toolbar_props_marker = '          showLegendTile={showLegendTile}\n          onToggleLegendTile={() => setShowLegendTile(!showLegendTile)}'
assert toolbar_props_marker in piper, "toolbar_props_marker not found in PiperDiagram.tsx"
piper = piper.replace(
    toolbar_props_marker,
    toolbar_props_marker + '\n          borderConfig={borderConfig}\n          onOpenBorderEditor={() => setEditingBorder(true)}',
    1
)

# Render DiagramBorderEditor modal
modal_marker = '      {/* Tile 2: Main Chart Tile (Pure white background, publication frame) */}'
assert modal_marker in piper, "modal_marker not found in PiperDiagram.tsx"
border_modal_code = '''      {/* Border Frame Studio Modal */}
      {editingBorder && (
        <DiagramBorderEditor
          config={borderConfig}
          onChange={setBorderConfig}
          onClose={() => setEditingBorder(false)}
          title="Piper Diagram Border Frame Studio"
        />
      )}

      {/* Tile 2: Main Chart Tile (Pure white background, publication frame) */}'''
piper = piper.replace(modal_marker, border_modal_code, 1)

# Render Outer Frame Border in main SVG
svg_bg_marker = '''          {/* Pure White SVG Background Rect */}
          <rect
            id="diagram-base-canvas-bg"
            x={-25 - diagramPadding}
            y={-25 - diagramPadding}
            width={540 + diagramPadding * 2}
            height={315 + diagramPadding * 2}
            fill="#ffffff"
          />'''
assert svg_bg_marker in piper, "svg_bg_marker not found in PiperDiagram.tsx"
border_svg_code = '''          {/* Pure White SVG Background Rect */}
          <rect
            id="diagram-base-canvas-bg"
            x={-25 - diagramPadding}
            y={-25 - diagramPadding}
            width={540 + diagramPadding * 2}
            height={315 + diagramPadding * 2}
            fill="#ffffff"
          />

          {/* Outer Frame Border with Color & Thickness Control (Reference Image Feature) */}
          {borderConfig.show && borderConfig.style !== "none" && borderConfig.thickness > 0 && (
            <g id="piper-outer-frame-border-group" pointerEvents="none">
              {borderConfig.style === "double" ? (
                <>
                  <rect
                    x={-25 - diagramPadding + borderConfig.padding}
                    y={-25 - diagramPadding + borderConfig.padding}
                    width={540 + diagramPadding * 2 - borderConfig.padding * 2}
                    height={315 + diagramPadding * 2 - borderConfig.padding * 2}
                    fill="none"
                    stroke={borderConfig.color}
                    strokeWidth={Math.max(1, borderConfig.thickness * 0.45)}
                    rx={borderConfig.radius}
                  />
                  <rect
                    x={-25 - diagramPadding + borderConfig.padding + borderConfig.thickness * 1.4}
                    y={-25 - diagramPadding + borderConfig.padding + borderConfig.thickness * 1.4}
                    width={Math.max(0, 540 + diagramPadding * 2 - borderConfig.padding * 2 - borderConfig.thickness * 2.8)}
                    height={Math.max(0, 315 + diagramPadding * 2 - borderConfig.padding * 2 - borderConfig.thickness * 2.8)}
                    fill="none"
                    stroke={borderConfig.color}
                    strokeWidth={Math.max(0.8, borderConfig.thickness * 0.35)}
                    rx={Math.max(0, borderConfig.radius - 2)}
                  />
                </>
              ) : (
                <rect
                  id="diagram-outer-frame-border"
                  x={-25 - diagramPadding + borderConfig.padding}
                  y={-25 - diagramPadding + borderConfig.padding}
                  width={540 + diagramPadding * 2 - borderConfig.padding * 2}
                  height={315 + diagramPadding * 2 - borderConfig.padding * 2}
                  fill="none"
                  stroke={borderConfig.color}
                  strokeWidth={borderConfig.thickness}
                  strokeDasharray={
                    borderConfig.style === "dashed"
                      ? "7 4"
                      : borderConfig.style === "dotted"
                      ? "2.5 2.5"
                      : undefined
                  }
                  rx={borderConfig.radius}
                />
              )}
            </g>
          )}'''
piper = piper.replace(svg_bg_marker, border_svg_code, 1)

# Render Outer Frame Border in Fullscreen SVG as well
fs_svg_marker = '''                  {/* Pure White Base Background Rect */}
                  <rect
                    id="diagram-base-canvas-bg"
                    x={-25 - diagramPadding}
                    y={-25 - diagramPadding}
                    width={540 + diagramPadding * 2}
                    height={315 + diagramPadding * 2}
                    fill="#ffffff"
                  />'''
assert fs_svg_marker in piper, "fs_svg_marker not found in PiperDiagram.tsx"
fs_border_code = '''                  {/* Pure White Base Background Rect */}
                  <rect
                    id="diagram-base-canvas-bg"
                    x={-25 - diagramPadding}
                    y={-25 - diagramPadding}
                    width={540 + diagramPadding * 2}
                    height={315 + diagramPadding * 2}
                    fill="#ffffff"
                  />
                  {borderConfig.show && borderConfig.style !== "none" && borderConfig.thickness > 0 && (
                    <rect
                      x={-25 - diagramPadding + borderConfig.padding}
                      y={-25 - diagramPadding + borderConfig.padding}
                      width={540 + diagramPadding * 2 - borderConfig.padding * 2}
                      height={315 + diagramPadding * 2 - borderConfig.padding * 2}
                      fill="none"
                      stroke={borderConfig.color}
                      strokeWidth={borderConfig.thickness}
                      strokeDasharray={
                        borderConfig.style === "dashed"
                          ? "7 4"
                          : borderConfig.style === "dotted"
                          ? "2.5 2.5"
                          : undefined
                      }
                      rx={borderConfig.radius}
                      pointerEvents="none"
                    />
                  )}'''
piper = piper.replace(fs_svg_marker, fs_border_code, 1)

with open("src/components/PiperDiagram.tsx", "w") as f:
    f.write(piper)
print("PiperDiagram.tsx updated with border controls!")

# =============================================================================
# 2. USSL DIAGRAM
# =============================================================================
with open("src/components/UsslDiagram.tsx", "r") as f:
    ussl = f.read()

# Add import
assert import_marker in ussl, "import_marker not found in UsslDiagram.tsx"
ussl = ussl.replace(
    import_marker,
    import_marker + '\nimport DiagramBorderEditor, { DiagramBorderConfig, DEFAULT_PIPER_BORDER_CONFIG } from "./DiagramBorderEditor";',
    1
)

# Add state
ussl_state_marker = '  const [diagramPadding, setDiagramPadding] = useState<number>(30);'
assert ussl_state_marker in ussl, "ussl_state_marker not found in UsslDiagram.tsx"
ussl = ussl.replace(
    ussl_state_marker,
    ussl_state_marker + '\n  const [borderConfig, setBorderConfig] = useState<DiagramBorderConfig>(DEFAULT_PIPER_BORDER_CONFIG);\n  const [editingBorder, setEditingBorder] = useState<boolean>(false);',
    1
)

# Pass props to DiagramToolbarStudio
ussl_tb_marker = '          showLegendTile={showLegendTile}\n          onToggleLegendTile={() => setShowLegendTile(!showLegendTile)}'
assert ussl_tb_marker in ussl, "ussl_tb_marker not found in UsslDiagram.tsx"
ussl = ussl.replace(
    ussl_tb_marker,
    ussl_tb_marker + '\n          borderConfig={borderConfig}\n          onOpenBorderEditor={() => setEditingBorder(true)}',
    1
)

# Render modal
ussl_modal_marker = '      {/* Main Chart Tile */}'
assert ussl_modal_marker in ussl, "ussl_modal_marker not found in UsslDiagram.tsx"
ussl_modal_code = '''      {/* Border Frame Studio Modal */}
      {editingBorder && (
        <DiagramBorderEditor
          config={borderConfig}
          onChange={setBorderConfig}
          onClose={() => setEditingBorder(false)}
          title="USSL Diagram Border Frame Studio"
        />
      )}

      {/* Main Chart Tile */}'''
ussl = ussl.replace(ussl_modal_marker, ussl_modal_code, 1)

# Render White BG and Outer Border inside USSL SVG
ussl_svg_marker = '<svg\n          ref={svgRef}\n          viewBox={`${-diagramPadding} ${-diagramPadding} ${width + diagramPadding * 2} ${height + diagramPadding * 2}`}\n          className="w-full h-auto max-w-full overflow-visible"\n          style={{ fontFamily: "\'Inter\', sans-serif", touchAction: "none" }}\n          onClick={() => {\n            if (!isDraggingTitle) setEditingKey(null);\n          }}\n        >'
assert ussl_svg_marker in ussl, "ussl_svg_marker not found in UsslDiagram.tsx"
ussl_svg_replacement = ussl_svg_marker + '''
          {/* Pure White Canvas Background */}
          <rect
            id="diagram-base-canvas-bg"
            x={-diagramPadding}
            y={-diagramPadding}
            width={width + diagramPadding * 2}
            height={height + diagramPadding * 2}
            fill="#ffffff"
          />

          {/* Outer Frame Border */}
          {borderConfig.show && borderConfig.style !== "none" && borderConfig.thickness > 0 && (
            <g id="ussl-outer-frame-border-group" pointerEvents="none">
              {borderConfig.style === "double" ? (
                <>
                  <rect
                    x={-diagramPadding + borderConfig.padding}
                    y={-diagramPadding + borderConfig.padding}
                    width={width + diagramPadding * 2 - borderConfig.padding * 2}
                    height={height + diagramPadding * 2 - borderConfig.padding * 2}
                    fill="none"
                    stroke={borderConfig.color}
                    strokeWidth={Math.max(1, borderConfig.thickness * 0.45)}
                    rx={borderConfig.radius}
                  />
                  <rect
                    x={-diagramPadding + borderConfig.padding + borderConfig.thickness * 1.4}
                    y={-diagramPadding + borderConfig.padding + borderConfig.thickness * 1.4}
                    width={Math.max(0, width + diagramPadding * 2 - borderConfig.padding * 2 - borderConfig.thickness * 2.8)}
                    height={Math.max(0, height + diagramPadding * 2 - borderConfig.padding * 2 - borderConfig.thickness * 2.8)}
                    fill="none"
                    stroke={borderConfig.color}
                    strokeWidth={Math.max(0.8, borderConfig.thickness * 0.35)}
                    rx={Math.max(0, borderConfig.radius - 2)}
                  />
                </>
              ) : (
                <rect
                  id="diagram-outer-frame-border"
                  x={-diagramPadding + borderConfig.padding}
                  y={-diagramPadding + borderConfig.padding}
                  width={width + diagramPadding * 2 - borderConfig.padding * 2}
                  height={height + diagramPadding * 2 - borderConfig.padding * 2}
                  fill="none"
                  stroke={borderConfig.color}
                  strokeWidth={borderConfig.thickness}
                  strokeDasharray={
                    borderConfig.style === "dashed"
                      ? "7 4"
                      : borderConfig.style === "dotted"
                      ? "2.5 2.5"
                      : undefined
                  }
                  rx={borderConfig.radius}
                />
              )}
            </g>
          )}'''
ussl = ussl.replace(ussl_svg_marker, ussl_svg_replacement, 1)

with open("src/components/UsslDiagram.tsx", "w") as f:
    f.write(ussl)
print("UsslDiagram.tsx updated with border controls!")

# =============================================================================
# 3. CHADHA DIAGRAM
# =============================================================================
with open("src/components/ChadhaDiagram.tsx", "r") as f:
    chadha = f.read()

# Add import
assert import_marker in chadha, "import_marker not found in ChadhaDiagram.tsx"
chadha = chadha.replace(
    import_marker,
    import_marker + '\nimport DiagramBorderEditor, { DiagramBorderConfig, DEFAULT_PIPER_BORDER_CONFIG } from "./DiagramBorderEditor";',
    1
)

# Add state
chadha_state_marker = '  const [diagramPadding, setDiagramPadding] = useState<number>(30);'
assert chadha_state_marker in chadha, "chadha_state_marker not found in ChadhaDiagram.tsx"
chadha = chadha.replace(
    chadha_state_marker,
    chadha_state_marker + '\n  const [borderConfig, setBorderConfig] = useState<DiagramBorderConfig>(DEFAULT_PIPER_BORDER_CONFIG);\n  const [editingBorder, setEditingBorder] = useState<boolean>(false);',
    1
)

# Pass props to DiagramToolbarStudio
chadha_tb_marker = '          showLegendTile={showLegendTile}\n          onToggleLegendTile={() => setShowLegendTile(!showLegendTile)}'
assert chadha_tb_marker in chadha, "chadha_tb_marker not found in ChadhaDiagram.tsx"
chadha = chadha.replace(
    chadha_tb_marker,
    chadha_tb_marker + '\n          borderConfig={borderConfig}\n          onOpenBorderEditor={() => setEditingBorder(true)}',
    1
)

# Render modal
chadha_modal_marker = '      {/* Main Chart Tile */}'
assert chadha_modal_marker in chadha, "chadha_modal_marker not found in ChadhaDiagram.tsx"
chadha_modal_code = '''      {/* Border Frame Studio Modal */}
      {editingBorder && (
        <DiagramBorderEditor
          config={borderConfig}
          onChange={setBorderConfig}
          onClose={() => setEditingBorder(false)}
          title="Chadha Diagram Border Frame Studio"
        />
      )}

      {/* Main Chart Tile */}'''
chadha = chadha.replace(chadha_modal_marker, chadha_modal_code, 1)

# Render White BG and Outer Border inside Chadha SVG
chadha_svg_marker = '<svg\n          ref={svgRef}\n          viewBox={`${-diagramPadding} ${-diagramPadding} ${510 + diagramPadding * 2} ${350 + diagramPadding * 2}`}\n          className="w-full h-auto max-h-[80vh] overflow-visible select-none"\n          style={{ fontFamily: "\'Inter\', sans-serif" }}\n        >'
assert chadha_svg_marker in chadha, "chadha_svg_marker not found in ChadhaDiagram.tsx"
chadha_svg_replacement = chadha_svg_marker + '''
          {/* Pure White Canvas Background */}
          <rect
            id="diagram-base-canvas-bg"
            x={-diagramPadding}
            y={-diagramPadding}
            width={510 + diagramPadding * 2}
            height={350 + diagramPadding * 2}
            fill="#ffffff"
          />

          {/* Outer Frame Border */}
          {borderConfig.show && borderConfig.style !== "none" && borderConfig.thickness > 0 && (
            <g id="chadha-outer-frame-border-group" pointerEvents="none">
              {borderConfig.style === "double" ? (
                <>
                  <rect
                    x={-diagramPadding + borderConfig.padding}
                    y={-diagramPadding + borderConfig.padding}
                    width={510 + diagramPadding * 2 - borderConfig.padding * 2}
                    height={350 + diagramPadding * 2 - borderConfig.padding * 2}
                    fill="none"
                    stroke={borderConfig.color}
                    strokeWidth={Math.max(1, borderConfig.thickness * 0.45)}
                    rx={borderConfig.radius}
                  />
                  <rect
                    x={-diagramPadding + borderConfig.padding + borderConfig.thickness * 1.4}
                    y={-diagramPadding + borderConfig.padding + borderConfig.thickness * 1.4}
                    width={Math.max(0, 510 + diagramPadding * 2 - borderConfig.padding * 2 - borderConfig.thickness * 2.8)}
                    height={Math.max(0, 350 + diagramPadding * 2 - borderConfig.padding * 2 - borderConfig.thickness * 2.8)}
                    fill="none"
                    stroke={borderConfig.color}
                    strokeWidth={Math.max(0.8, borderConfig.thickness * 0.35)}
                    rx={Math.max(0, borderConfig.radius - 2)}
                  />
                </>
              ) : (
                <rect
                  id="diagram-outer-frame-border"
                  x={-diagramPadding + borderConfig.padding}
                  y={-diagramPadding + borderConfig.padding}
                  width={510 + diagramPadding * 2 - borderConfig.padding * 2}
                  height={350 + diagramPadding * 2 - borderConfig.padding * 2}
                  fill="none"
                  stroke={borderConfig.color}
                  strokeWidth={borderConfig.thickness}
                  strokeDasharray={
                    borderConfig.style === "dashed"
                      ? "7 4"
                      : borderConfig.style === "dotted"
                      ? "2.5 2.5"
                      : undefined
                  }
                  rx={borderConfig.radius}
                />
              )}
            </g>
          )}'''
chadha = chadha.replace(chadha_svg_marker, chadha_svg_replacement, 1)

with open("src/components/ChadhaDiagram.tsx", "w") as f:
    f.write(chadha)
print("ChadhaDiagram.tsx updated with border controls!")

# =============================================================================
# 4. GIBBS DIAGRAMS
# =============================================================================
with open("src/components/GibbsDiagrams.tsx", "r") as f:
    gibbs = f.read()

# Add import
assert import_marker in gibbs, "import_marker not found in GibbsDiagrams.tsx"
gibbs = gibbs.replace(
    import_marker,
    import_marker + '\nimport DiagramBorderEditor, { DiagramBorderConfig, DEFAULT_PIPER_BORDER_CONFIG } from "./DiagramBorderEditor";',
    1
)

# Add state
gibbs_state_marker = '  const [diagramPadding, setDiagramPadding] = useState<number>(30);'
assert gibbs_state_marker in gibbs, "gibbs_state_marker not found in GibbsDiagrams.tsx"
gibbs = gibbs.replace(
    gibbs_state_marker,
    gibbs_state_marker + '\n  const [borderConfig, setBorderConfig] = useState<DiagramBorderConfig>(DEFAULT_PIPER_BORDER_CONFIG);\n  const [editingBorder, setEditingBorder] = useState<boolean>(false);',
    1
)

# Pass props to DiagramToolbarStudio
gibbs_tb_marker = '          showLegendTile={showLegendTile}\n          onToggleLegendTile={() => setShowLegendTile(!showLegendTile)}'
assert gibbs_tb_marker in gibbs, "gibbs_tb_marker not found in GibbsDiagrams.tsx"
gibbs = gibbs.replace(
    gibbs_tb_marker,
    gibbs_tb_marker + '\n          borderConfig={borderConfig}\n          onOpenBorderEditor={() => setEditingBorder(true)}',
    1
)

# Render modal
gibbs_modal_marker = '      {/* Main Chart Tile */}'
assert gibbs_modal_marker in gibbs, "gibbs_modal_marker not found in GibbsDiagrams.tsx"
gibbs_modal_code = '''      {/* Border Frame Studio Modal */}
      {editingBorder && (
        <DiagramBorderEditor
          config={borderConfig}
          onChange={setBorderConfig}
          onClose={() => setEditingBorder(false)}
          title="Gibbs Diagram Border Frame Studio"
        />
      )}

      {/* Main Chart Tile */}'''
gibbs = gibbs.replace(gibbs_modal_marker, gibbs_modal_code, 1)

# Render Outer Border inside Gibbs SVG right after canvas bg rect
gibbs_svg_bg = '''          {/* Pure White Diagram Canvas Background */}
          <rect
            id="diagram-base-canvas-bg"
            x={-diagramPadding}
            y={-diagramPadding}
            width={width + diagramPadding * 2}
            height={height + diagramPadding * 2}
            fill="#ffffff"
          />'''
assert gibbs_svg_bg in gibbs, "gibbs_svg_bg not found in GibbsDiagrams.tsx"
gibbs_border_code = '''          {/* Pure White Diagram Canvas Background */}
          <rect
            id="diagram-base-canvas-bg"
            x={-diagramPadding}
            y={-diagramPadding}
            width={width + diagramPadding * 2}
            height={height + diagramPadding * 2}
            fill="#ffffff"
          />

          {/* Outer Frame Border */}
          {borderConfig.show && borderConfig.style !== "none" && borderConfig.thickness > 0 && (
            <g id="gibbs-outer-frame-border-group" pointerEvents="none">
              {borderConfig.style === "double" ? (
                <>
                  <rect
                    x={-diagramPadding + borderConfig.padding}
                    y={-diagramPadding + borderConfig.padding}
                    width={width + diagramPadding * 2 - borderConfig.padding * 2}
                    height={height + diagramPadding * 2 - borderConfig.padding * 2}
                    fill="none"
                    stroke={borderConfig.color}
                    strokeWidth={Math.max(1, borderConfig.thickness * 0.45)}
                    rx={borderConfig.radius}
                  />
                  <rect
                    x={-diagramPadding + borderConfig.padding + borderConfig.thickness * 1.4}
                    y={-diagramPadding + borderConfig.padding + borderConfig.thickness * 1.4}
                    width={Math.max(0, width + diagramPadding * 2 - borderConfig.padding * 2 - borderConfig.thickness * 2.8)}
                    height={Math.max(0, height + diagramPadding * 2 - borderConfig.padding * 2 - borderConfig.thickness * 2.8)}
                    fill="none"
                    stroke={borderConfig.color}
                    strokeWidth={Math.max(0.8, borderConfig.thickness * 0.35)}
                    rx={Math.max(0, borderConfig.radius - 2)}
                  />
                </>
              ) : (
                <rect
                  id="diagram-outer-frame-border"
                  x={-diagramPadding + borderConfig.padding}
                  y={-diagramPadding + borderConfig.padding}
                  width={width + diagramPadding * 2 - borderConfig.padding * 2}
                  height={height + diagramPadding * 2 - borderConfig.padding * 2}
                  fill="none"
                  stroke={borderConfig.color}
                  strokeWidth={borderConfig.thickness}
                  strokeDasharray={
                    borderConfig.style === "dashed"
                      ? "7 4"
                      : borderConfig.style === "dotted"
                      ? "2.5 2.5"
                      : undefined
                  }
                  rx={borderConfig.radius}
                />
              )}
            </g>
          )}'''
gibbs = gibbs.replace(gibbs_svg_bg, gibbs_border_code, 1)

with open("src/components/GibbsDiagrams.tsx", "w") as f:
    f.write(gibbs)
print("GibbsDiagrams.tsx updated with border controls!")

print("All 4 diagrams (Piper, USSL, Chadha, Gibbs) now fully equipped with outer border drawing facility!")
