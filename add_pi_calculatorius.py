import re
with open('src/components/CalculatoriusView.tsx', 'r') as f:
    code = f.read()

target = r'''            </CardWrapper>

          </div>

          {/\* Section 3: Classifications \*/}'''

replacement = '''            </CardWrapper>

            <CardWrapper gradientFrom="from-purple-500" gradientVia="via-fuchsia-500" gradientTo="to-pink-500" shadowColor="rgba(168,85,247,0.5)">
              <h4 className="font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600 text-lg mb-2 drop-shadow-sm">Permeability Index (PI)</h4>
              <p className="text-xs text-slate-600 mb-4 font-medium">
                Indicates the soil permeability hazard. Ions in meq/L.
              </p>
              <div className="bg-gradient-to-b from-slate-50 to-white p-4 rounded-2xl border border-slate-100 shadow-[inset_0_2px_10px_rgba(0,0,0,0.02)] text-xs text-slate-700 flex-1 flex flex-col justify-center">
                <div className="font-mono text-center font-bold text-slate-800 bg-white p-3 rounded-xl border border-slate-200 shadow-sm mb-3 text-[10px]">
                  PI (%) = [(Na⁺ + √HCO₃⁻) / (Ca²⁺ + Mg²⁺ + Na⁺)] × 100
                </div>
                {pi !== null && (
                  <div className="text-center">
                    <span className="text-[10px] font-black text-purple-600 uppercase tracking-widest">Sample 1 PI:</span><br/>
                    <span className="text-sm font-bold text-slate-800">{pi.toFixed(2)}%</span>
                  </div>
                )}
              </div>
            </CardWrapper>

          </div>

          {/* Section 3: Classifications */}'''

code = re.sub(target, replacement, code)

with open('src/components/CalculatoriusView.tsx', 'w') as f:
    f.write(code)
