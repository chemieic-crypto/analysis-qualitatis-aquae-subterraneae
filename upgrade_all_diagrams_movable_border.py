import re

print("Upgrading Piper, USSL, Chadha, and Gibbs to fully movable/customizable border...")

# =============================================================================
# 1. PIPER DIAGRAM
# =============================================================================
with open("src/components/PiperDiagram.tsx", "r") as f:
    piper = f.read()

# Add Move to lucide-react if needed, or import from lucide-react
if 'import { Move } from "lucide-react";' not in piper and 'Move,' not in piper:
    piper = piper.replace(
        'import DiagramBorderEditor, { DiagramBorderConfig, DEFAULT_PIPER_BORDER_CONFIG } from "./DiagramBorderEditor";',
        'import DiagramBorderEditor, { DiagramBorderConfig, DEFAULT_PIPER_BORDER_CONFIG, DiagramBorderFrame } from "./DiagramBorderEditor";\nimport { Move } from "lucide-react";'
    )
else:
    piper = piper.replace(
        'import DiagramBorderEditor, { DiagramBorderConfig, DEFAULT_PIPER_BORDER_CONFIG } from "./DiagramBorderEditor";',
        'import DiagramBorderEditor, { DiagramBorderConfig, DEFAULT_PIPER_BORDER_CONFIG, DiagramBorderFrame } from "./DiagramBorderEditor";'
    )

# Add isAdjustingBorder state
state_target = '  const [editingBorder, setEditingBorder] = useState<boolean>(false);'
assert state_target in piper, "state_target not found in PiperDiagram.tsx"
piper = piper.replace(
    state_target,
    state_target + '\n  const [isAdjustingBorder, setIsAdjustingBorder] = useState<boolean>(false);'
)

# In DiagramToolbarStudio pass isAdjustingBorder and onToggleAdjustBorder
tb_target = '          borderConfig={borderConfig}\n          onOpenBorderEditor={() => setEditingBorder(true)}'
assert tb_target in piper, "tb_target not found in PiperDiagram.tsx"
piper = piper.replace(
    tb_target,
    tb_target + '\n          isAdjustingBorder={isAdjustingBorder}\n          onToggleAdjustBorder={() => setIsAdjustingBorder((p) => !p)}'
)

# In DiagramBorderEditor pass onStartInteractiveAdjust
editor_target = '        <DiagramBorderEditor\n          config={borderConfig}\n          onChange={setBorderConfig}\n          onClose={() => setEditingBorder(false)}\n          title="Piper Diagram Border Frame Studio"\n        />'
assert editor_target in piper, "editor_target not found in PiperDiagram.tsx"
piper = piper.replace(
    editor_target,
    '        <DiagramBorderEditor\n          config={borderConfig}\n          onChange={setBorderConfig}\n          onClose={() => setEditingBorder(false)}\n          title="Piper Diagram Border Frame Studio"\n          onStartInteractiveAdjust={() => setIsAdjustingBorder(true)}\n        />'
)

# Add banner above main chart
banner_marker = '      {/* Tile 2: Main Chart Tile (Pure white background, publication frame) */}'
assert banner_marker in piper, "banner_marker not found in PiperDiagram.tsx"
banner_code = '''      {/* Move & Fit Border Mode Floating Banner */}
      {isAdjustingBorder && (
        <div className="w-full max-w-[1240px] mb-2 bg-amber-500 text-slate-950 px-4 py-2.5 rounded-2xl flex items-center justify-between text-xs font-bold shadow-md animate-in slide-in-from-top-2 border border-amber-600 z-30">
          <div className="flex items-center gap-2">
            <Move className="w-4 h-4 animate-bounce" />
            <span>
              <strong>Move &amp; Fit Border Active:</strong> Drag handles or the frame directly on the diagram to fit content.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsAdjustingBorder(false)}
            className="bg-slate-900 text-white px-3 py-1 rounded-xl text-xs font-black shadow-xs hover:bg-black transition"
          >
            ✓ Done
          </button>
        </div>
      )}

      {/* Tile 2: Main Chart Tile (Pure white background, publication frame) */}'''
piper = piper.replace(banner_marker, banner_code, 1)

# Replace SVG border block in main SVG
old_svg_border_pattern = r'\{/\* Outer Frame Border with Color & Thickness Control \(Reference Image Feature\) \*/\}[\s\S]*?</g>\s*\}\)'
assert re.search(old_svg_border_pattern, piper), "old_svg_border_pattern not found in PiperDiagram.tsx"
new_svg_border = '''{/* Moveable & Customisable Outer Frame Border */}
          <DiagramBorderFrame
            baseX={-25 - diagramPadding}
            baseY={-25 - diagramPadding}
            baseWidth={540 + diagramPadding * 2}
            baseHeight={315 + diagramPadding * 2}
            config={borderConfig}
            isInteractive={isAdjustingBorder}
            onConfigChange={setBorderConfig}
            svgRef={svgRef}
            idPrefix="piper"
          />'''
piper = re.sub(old_svg_border_pattern, new_svg_border, piper, count=1)

# Replace in Fullscreen SVG
old_fs_border_pattern = r'\{borderConfig\.show && borderConfig\.style !== "none" && borderConfig\.thickness > 0 && \([\s\S]*?pointerEvents="none"\s*/>\s*\}\)'
if re.search(old_fs_border_pattern, piper):
    new_fs_border = '''<DiagramBorderFrame
                    baseX={-25 - diagramPadding}
                    baseY={-25 - diagramPadding}
                    baseWidth={540 + diagramPadding * 2}
                    baseHeight={315 + diagramPadding * 2}
                    config={borderConfig}
                    isInteractive={false}
                    idPrefix="piper-fs"
                  />'''
    piper = re.sub(old_fs_border_pattern, new_fs_border, piper, count=1)

with open("src/components/PiperDiagram.tsx", "w") as f:
    f.write(piper)
print("PiperDiagram.tsx upgraded!")

# =============================================================================
# 2. USSL DIAGRAM
# =============================================================================
with open("src/components/UsslDiagram.tsx", "r") as f:
    ussl = f.read()

ussl = ussl.replace(
    'import DiagramBorderEditor, { DiagramBorderConfig, DEFAULT_PIPER_BORDER_CONFIG } from "./DiagramBorderEditor";',
    'import DiagramBorderEditor, { DiagramBorderConfig, DEFAULT_PIPER_BORDER_CONFIG, DiagramBorderFrame } from "./DiagramBorderEditor";\nimport { Move } from "lucide-react";'
)

ussl_state_target = '  const [editingBorder, setEditingBorder] = useState<boolean>(false);'
assert ussl_state_target in ussl, "ussl_state_target not found in UsslDiagram.tsx"
ussl = ussl.replace(
    ussl_state_target,
    ussl_state_target + '\n  const [isAdjustingBorder, setIsAdjustingBorder] = useState<boolean>(false);'
)

ussl = ussl.replace(
    tb_target,
    tb_target + '\n          isAdjustingBorder={isAdjustingBorder}\n          onToggleAdjustBorder={() => setIsAdjustingBorder((p) => !p)}'
)

ussl_editor_target = '        <DiagramBorderEditor\n          config={borderConfig}\n          onChange={setBorderConfig}\n          onClose={() => setEditingBorder(false)}\n          title="USSL Diagram Border Frame Studio"\n        />'
assert ussl_editor_target in ussl, "ussl_editor_target not found in UsslDiagram.tsx"
ussl = ussl.replace(
    ussl_editor_target,
    '        <DiagramBorderEditor\n          config={borderConfig}\n          onChange={setBorderConfig}\n          onClose={() => setEditingBorder(false)}\n          title="USSL Diagram Border Frame Studio"\n          onStartInteractiveAdjust={() => setIsAdjustingBorder(true)}\n        />'
)

ussl_banner_marker = '{/* Tile 2: Main Chart Tile (Pure white background, clean publication frame) */}'
assert ussl_banner_marker in ussl, "ussl_banner_marker not found in UsslDiagram.tsx"
ussl_banner_code = '''{/* Move & Fit Border Mode Floating Banner */}
      {isAdjustingBorder && (
        <div className="w-full max-w-[1240px] mb-2 bg-amber-500 text-slate-950 px-4 py-2.5 rounded-2xl flex items-center justify-between text-xs font-bold shadow-md animate-in slide-in-from-top-2 border border-amber-600 z-30">
          <div className="flex items-center gap-2">
            <Move className="w-4 h-4 animate-bounce" />
            <span>
              <strong>Move &amp; Fit Border Active:</strong> Drag handles or the frame directly on the diagram to fit content.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsAdjustingBorder(false)}
            className="bg-slate-900 text-white px-3 py-1 rounded-xl text-xs font-black shadow-xs hover:bg-black transition"
          >
            ✓ Done
          </button>
        </div>
      )}

      {/* Tile 2: Main Chart Tile (Pure white background, clean publication frame) */}'''
ussl = ussl.replace(ussl_banner_marker, ussl_banner_code, 1)

ussl_border_pattern = r'\{/\* Outer Frame Border with Color & Thickness Control \*/\}[\s\S]*?</g>\s*\}\)'
assert re.search(ussl_border_pattern, ussl), "ussl_border_pattern not found in UsslDiagram.tsx"
ussl_new_border = '''{/* Moveable & Customisable Outer Frame Border */}
          <DiagramBorderFrame
            baseX={-diagramPadding}
            baseY={-diagramPadding}
            baseWidth={width + diagramPadding * 2}
            baseHeight={height + diagramPadding * 2}
            config={borderConfig}
            isInteractive={isAdjustingBorder}
            onConfigChange={setBorderConfig}
            svgRef={svgRef}
            idPrefix="ussl"
          />'''
ussl = re.sub(ussl_border_pattern, ussl_new_border, ussl, count=1)

with open("src/components/UsslDiagram.tsx", "w") as f:
    f.write(ussl)
print("UsslDiagram.tsx upgraded!")

# =============================================================================
# 3. CHADHA DIAGRAM
# =============================================================================
with open("src/components/ChadhaDiagram.tsx", "r") as f:
    chadha = f.read()

chadha = chadha.replace(
    'import DiagramBorderEditor, { DiagramBorderConfig, DEFAULT_PIPER_BORDER_CONFIG } from "./DiagramBorderEditor";',
    'import DiagramBorderEditor, { DiagramBorderConfig, DEFAULT_PIPER_BORDER_CONFIG, DiagramBorderFrame } from "./DiagramBorderEditor";\nimport { Move } from "lucide-react";'
)

chadha_state_target = '  const [editingBorder, setEditingBorder] = useState<boolean>(false);'
assert chadha_state_target in chadha, "chadha_state_target not found in ChadhaDiagram.tsx"
chadha = chadha.replace(
    chadha_state_target,
    chadha_state_target + '\n  const [isAdjustingBorder, setIsAdjustingBorder] = useState<boolean>(false);'
)

chadha = chadha.replace(
    tb_target,
    tb_target + '\n          isAdjustingBorder={isAdjustingBorder}\n          onToggleAdjustBorder={() => setIsAdjustingBorder((p) => !p)}'
)

chadha_editor_target = '        <DiagramBorderEditor\n          config={borderConfig}\n          onChange={setBorderConfig}\n          onClose={() => setEditingBorder(false)}\n          title="Chadha Diagram Border Frame Studio"\n        />'
assert chadha_editor_target in chadha, "chadha_editor_target not found in ChadhaDiagram.tsx"
chadha = chadha.replace(
    chadha_editor_target,
    '        <DiagramBorderEditor\n          config={borderConfig}\n          onChange={setBorderConfig}\n          onClose={() => setEditingBorder(false)}\n          title="Chadha Diagram Border Frame Studio"\n          onStartInteractiveAdjust={() => setIsAdjustingBorder(true)}\n        />'
)

chadha_banner_marker = '{/* Tile 2: Main Chart Tile (Pure white background, publication frame) */}'
assert chadha_banner_marker in chadha, "chadha_banner_marker not found in ChadhaDiagram.tsx"
chadha_banner_code = '''{/* Move & Fit Border Mode Floating Banner */}
      {isAdjustingBorder && (
        <div className="w-full max-w-[1100px] mb-2 bg-amber-500 text-slate-950 px-4 py-2.5 rounded-2xl flex items-center justify-between text-xs font-bold shadow-md animate-in slide-in-from-top-2 border border-amber-600 z-30">
          <div className="flex items-center gap-2">
            <Move className="w-4 h-4 animate-bounce" />
            <span>
              <strong>Move &amp; Fit Border Active:</strong> Drag handles or the frame directly on the diagram to fit content.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsAdjustingBorder(false)}
            className="bg-slate-900 text-white px-3 py-1 rounded-xl text-xs font-black shadow-xs hover:bg-black transition"
          >
            ✓ Done
          </button>
        </div>
      )}

      {/* Tile 2: Main Chart Tile (Pure white background, publication frame) */}'''
chadha = chadha.replace(chadha_banner_marker, chadha_banner_code, 1)

chadha_border_pattern = r'\{/\* Outer Frame Border with Color & Thickness Control \*/\}[\s\S]*?</g>\s*\}\)'
assert re.search(chadha_border_pattern, chadha), "chadha_border_pattern not found in ChadhaDiagram.tsx"
chadha_new_border = '''{/* Moveable & Customisable Outer Frame Border */}
          <DiagramBorderFrame
            baseX={-diagramPadding}
            baseY={-diagramPadding}
            baseWidth={510 + diagramPadding * 2}
            baseHeight={350 + diagramPadding * 2}
            config={borderConfig}
            isInteractive={isAdjustingBorder}
            onConfigChange={setBorderConfig}
            svgRef={svgRef}
            idPrefix="chadha"
          />'''
chadha = re.sub(chadha_border_pattern, chadha_new_border, chadha, count=1)

with open("src/components/ChadhaDiagram.tsx", "w") as f:
    f.write(chadha)
print("ChadhaDiagram.tsx upgraded!")

# =============================================================================
# 4. GIBBS DIAGRAMS
# =============================================================================
with open("src/components/GibbsDiagrams.tsx", "r") as f:
    gibbs = f.read()

gibbs = gibbs.replace(
    'import DiagramBorderEditor, { DiagramBorderConfig, DEFAULT_PIPER_BORDER_CONFIG } from "./DiagramBorderEditor";',
    'import DiagramBorderEditor, { DiagramBorderConfig, DEFAULT_PIPER_BORDER_CONFIG, DiagramBorderFrame } from "./DiagramBorderEditor";\nimport { Move } from "lucide-react";'
)

gibbs_state_target = '  const [editingBorder, setEditingBorder] = useState<boolean>(false);'
assert gibbs_state_target in gibbs, "gibbs_state_target not found in GibbsDiagrams.tsx"
gibbs = gibbs.replace(
    gibbs_state_target,
    gibbs_state_target + '\n  const [isAdjustingBorder, setIsAdjustingBorder] = useState<boolean>(false);'
)

gibbs = gibbs.replace(
    tb_target,
    tb_target + '\n          isAdjustingBorder={isAdjustingBorder}\n          onToggleAdjustBorder={() => setIsAdjustingBorder((p) => !p)}'
)

gibbs_editor_target = '        <DiagramBorderEditor\n          config={borderConfig}\n          onChange={setBorderConfig}\n          onClose={() => setEditingBorder(false)}\n          title="Gibbs Diagram Border Frame Studio"\n        />'
assert gibbs_editor_target in gibbs, "gibbs_editor_target not found in GibbsDiagrams.tsx"
gibbs = gibbs.replace(
    gibbs_editor_target,
    '        <DiagramBorderEditor\n          config={borderConfig}\n          onChange={setBorderConfig}\n          onClose={() => setEditingBorder(false)}\n          title="Gibbs Diagram Border Frame Studio"\n          onStartInteractiveAdjust={() => setIsAdjustingBorder(true)}\n        />'
)

gibbs_banner_marker = '{/* Tile 2: Main Chart Tile (Pure white background, publication frame) */}'
assert gibbs_banner_marker in gibbs, "gibbs_banner_marker not found in GibbsDiagrams.tsx"
gibbs_banner_code = '''{/* Move & Fit Border Mode Floating Banner */}
      {isAdjustingBorder && (
        <div className="w-full max-w-[1240px] mb-2 bg-amber-500 text-slate-950 px-4 py-2.5 rounded-2xl flex items-center justify-between text-xs font-bold shadow-md animate-in slide-in-from-top-2 border border-amber-600 z-30">
          <div className="flex items-center gap-2">
            <Move className="w-4 h-4 animate-bounce" />
            <span>
              <strong>Move &amp; Fit Border Active:</strong> Drag handles or the frame directly on the diagram to fit content.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsAdjustingBorder(false)}
            className="bg-slate-900 text-white px-3 py-1 rounded-xl text-xs font-black shadow-xs hover:bg-black transition"
          >
            ✓ Done
          </button>
        </div>
      )}

      {/* Tile 2: Main Chart Tile (Pure white background, publication frame) */}'''
gibbs = gibbs.replace(gibbs_banner_marker, gibbs_banner_code, 1)

gibbs_border_pattern = r'\{/\* Outer Frame Border with Color & Thickness Control \*/\}[\s\S]*?</g>\s*\}\)'
assert re.search(gibbs_border_pattern, gibbs), "gibbs_border_pattern not found in GibbsDiagrams.tsx"
gibbs_new_border = '''{/* Moveable & Customisable Outer Frame Border */}
          <DiagramBorderFrame
            baseX={-diagramPadding}
            baseY={-diagramPadding}
            baseWidth={width + diagramPadding * 2}
            baseHeight={height + diagramPadding * 2}
            config={borderConfig}
            isInteractive={isAdjustingBorder}
            onConfigChange={setBorderConfig}
            svgRef={svgRef}
            idPrefix="gibbs"
          />'''
gibbs = re.sub(gibbs_border_pattern, gibbs_new_border, gibbs, count=1)

with open("src/components/GibbsDiagrams.tsx", "w") as f:
    f.write(gibbs)
print("GibbsDiagrams.tsx upgraded!")

print("All 4 diagrams successfully upgraded with movable border and on-canvas fit handles!")
