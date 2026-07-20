import re
with open('src/components/CalculatoriusView.tsx', 'r') as f:
    code = f.read()

bad_piper = r'''              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                <h4 className="font-bold text-slate-800 text-sm mb-2">Piper Trilinear Facies</h4>
                <p className="text-xs text-slate-600 mb-3">
                  Determines the dominant water type based on the relative proportions \(%\) of cations and anions.
                </p>
                <div className="bg-white p-4 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-2">
                  <p><strong>Cation Types:</strong></p>
                  <ul className="list-disc pl-4 space-y-1 mb-3">
                    <li>Calcium type: Ca &gt; 50%</li>
                    <li>Magnesium type: Mg &gt; 50%</li>
                    <li>Sodium/Potassium type: Na\+K &gt; 50%</li>
                    <li>Mixed type: No single cation &gt; 50%</li>
                  </ul>
                  
                  <p><strong>Anion Types:</strong></p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>Bicarbonate type: HCO3\+CO3 &gt; 50%</li>
                    <li>Sulfate type: SO4 &gt; 50%</li>
                    <li>Chloride type: Cl &gt; 50%</li>
                    <li>Mixed type: No single anion &gt; 50%</li>
                  </ul>
                </div>
                <p className="text-\[10px\] text-slate-500 mt-2 italic">The overall facies combines these \(e.g., Ca-HCO3 water type\).</p>
              </div>'''

good_piper = '''              <div className="bg-gradient-to-br from-indigo-500 via-purple-500 to-fuchsia-500 p-1 rounded-3xl shadow-[0_10px_40px_-10px_rgba(168,85,247,0.5)] hover:shadow-[0_20px_50px_-10px_rgba(168,85,247,0.6)] transition-all duration-300 transform hover:-translate-y-1">
                <div className="bg-white/95 backdrop-blur-sm p-6 rounded-[22px] h-full flex flex-col relative overflow-hidden">
                  
                  <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-fuchsia-300 to-purple-400 rounded-full blur-3xl opacity-20 -mr-10 -mt-10"></div>
                  <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-indigo-300 to-blue-400 rounded-full blur-3xl opacity-20 -ml-10 -mb-10"></div>
                  
                  <h4 className="font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-lg mb-2 relative z-10 drop-shadow-sm">
                    Piper Trilinear Facies
                  </h4>
                  <p className="text-xs text-slate-600 mb-4 font-medium relative z-10">
                    Determines the dominant water type based on the relative proportions (%) of cations and anions.
                  </p>
                  
                  <div className="bg-gradient-to-b from-slate-50 to-white p-5 rounded-2xl border border-slate-100 shadow-[inset_0_2px_10px_rgba(0,0,0,0.02)] text-xs text-slate-700 space-y-4 relative z-10 flex-1">
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="font-bold text-indigo-700 mb-2 border-b border-indigo-100 pb-1">Cation Types</p>
                        <ul className="space-y-1.5 font-medium">
                          <li className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>Ca &gt; 50%</li>
                          <li className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>Mg &gt; 50%</li>
                          <li className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>Na+K &gt; 50%</li>
                          <li className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>Mixed</li>
                        </ul>
                      </div>
                      
                      <div>
                        <p className="font-bold text-fuchsia-700 mb-2 border-b border-fuchsia-100 pb-1">Anion Types</p>
                        <ul className="space-y-1.5 font-medium">
                          <li className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>HCO3+CO3 &gt; 50%</li>
                          <li className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-cyan-500"></span>SO4 &gt; 50%</li>
                          <li className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-violet-500"></span>Cl &gt; 50%</li>
                          <li className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>Mixed</li>
                        </ul>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-slate-200">
                      <p className="font-black text-slate-800 mb-2">Detailed Mixed Facies Classification:</p>
                      <p className="text-[10px] text-slate-600 mb-3 italic">Calculated using combined proportions of Alkaline Earths (Ca+Mg) and Strong Acids (Cl+SO4).</p>
                      
                      <div className="space-y-2 text-[10px] sm:text-xs">
                        <div className="bg-white p-2.5 rounded-xl border border-emerald-100 shadow-sm shadow-emerald-100/50 flex flex-col gap-1">
                          <strong className="text-emerald-700">Mixed Type A</strong>
                          <span className="text-slate-600">Alkaline Earths (Ca+Mg) &ge; 50% <strong>AND</strong> Strong Acids (Cl+SO4) &ge; 50%<br/><span className="text-emerald-600 font-medium">but their sum is &lt; 150%</span></span>
                        </div>
                        
                        <div className="bg-white p-2.5 rounded-xl border border-rose-100 shadow-sm shadow-rose-100/50 flex flex-col gap-1">
                          <strong className="text-rose-700">Mixed Type B</strong>
                          <span className="text-slate-600">Alkalies (Na+K) &gt; 50% <strong>AND</strong> Weak Acids (HCO3+CO3) &gt; 50%<br/><span className="text-rose-600 font-medium">but Alkaline Earths + Strong Acids &ge; 50%</span></span>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
              </div>'''

code = re.sub(bad_piper, good_piper, code)

with open('src/components/CalculatoriusView.tsx', 'w') as f:
    f.write(code)
