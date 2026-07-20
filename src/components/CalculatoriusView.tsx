import React, { useMemo } from "react";
import { Calculator, Beaker, FileSpreadsheet, Waves, Info } from "lucide-react";
import { processAquiferData } from "../utils/usslMath";

export interface CalculatoriusViewProps {
  rawData?: any[];
  headerMap?: Record<string, string>;
}

const CardWrapper: React.FC<{
  children: React.ReactNode;
  gradientFrom: string;
  gradientVia: string;
  gradientTo: string;
  shadowColor: string;
}> = ({ children, gradientFrom, gradientVia, gradientTo, shadowColor }) => (
  <div className={`bg-gradient-to-br ${gradientFrom} ${gradientVia} ${gradientTo} p-1 rounded-3xl shadow-[0_10px_40px_-10px_${shadowColor}] hover:shadow-[0_20px_50px_-10px_${shadowColor}] transition-all duration-300 transform hover:-translate-y-1 h-full flex flex-col`}>
    <div className="bg-white/95 backdrop-blur-sm p-6 rounded-[22px] h-full flex flex-col relative overflow-hidden">
      <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${gradientTo} to-white rounded-full blur-3xl opacity-20 -mr-10 -mt-10`}></div>
      <div className={`absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr ${gradientFrom} to-white rounded-full blur-3xl opacity-20 -ml-10 -mb-10`}></div>
      <div className="relative z-10 flex-1 flex flex-col">
        {children}
      </div>
    </div>
  </div>
);

export const CalculatoriusView: React.FC<CalculatoriusViewProps> = ({ rawData = [], headerMap = {} }) => {
  const sampleData = useMemo(() => {
    if (!rawData || rawData.length === 0) return null;
    const processed = processAquiferData([rawData[0]], headerMap);
    return processed && processed.length > 0 ? processed[0] : null;
  }, [rawData, headerMap]);

  const calc = sampleData?._calc;

  const getCBE = () => {
    if (!calc) return null;
    const { Ca, Mg, Na, K, Cl, SO4, HCO3, CO3 } = calc.meq;
    const tzPlus = Ca + Mg + Na + K;
    const tzMinus = Cl + SO4 + HCO3 + CO3;
    if (tzPlus + tzMinus === 0) return null;
    return ((tzPlus - tzMinus) / (tzPlus + tzMinus)) * 100;
  };
  
  const getRSC = () => {
    if (!calc) return null;
    const { Ca, Mg, HCO3, CO3 } = calc.meq;
    return (CO3 + HCO3) - (Ca + Mg);
  };
  
  const getPI = () => {
    if (!calc) return null;
    const { Ca, Mg, Na, HCO3 } = calc.meq;
    const denom = Ca + Mg + Na;
    if (denom === 0) return null;
    return ((Na + Math.sqrt(HCO3)) / denom) * 100;
  };

  const cbe = getCBE();
  const rsc = getRSC();
  const pi = getPI();

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm">
        <div className="flex items-center gap-4 mb-8 border-b border-slate-100 pb-6">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
            <Calculator className="w-7 h-7 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Calculatorius</h2>
            <p className="text-sm font-medium text-slate-500 mt-1">
              Methodology and formulas used for calculating water quality indices and classifications.
            </p>
          </div>
        </div>

        {sampleData && (
          <div className="mb-8 p-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl flex items-center gap-4">
            <Info className="w-6 h-6 text-indigo-500 shrink-0" />
            <p className="text-sm text-indigo-800 font-medium">
              Real-time calculations are shown for Sample #1: <strong className="text-indigo-950 font-black">{calc?.locName || "Unknown"}</strong>
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Section 1: Standard Parameters */}
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Beaker className="w-5 h-5 text-emerald-500" />
              Standard Parameter Conversions
            </h3>

            <CardWrapper gradientFrom="from-emerald-500" gradientVia="via-teal-500" gradientTo="to-cyan-500" shadowColor="rgba(16,185,129,0.5)">
              <h4 className="font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-600 text-lg mb-2 drop-shadow-sm">Total Dissolved Solids (TDS)</h4>
              <p className="text-xs text-slate-600 mb-4 font-medium">
                If TDS is not explicitly provided in the dataset, it is commonly estimated from Electrical Conductivity (EC).
              </p>
              <div className="bg-gradient-to-b from-slate-50 to-white p-4 rounded-2xl border border-slate-100 shadow-[inset_0_2px_10px_rgba(0,0,0,0.02)] text-xs text-slate-700 flex-1 flex flex-col justify-center">
                <div className="font-mono text-center font-bold text-slate-800 bg-white p-3 rounded-xl border border-slate-200 shadow-sm mb-3">
                  TDS (mg/L) ≈ EC (µS/cm) × 0.64
                </div>
                {calc && calc.ecVal !== null && (
                  <div className="text-center">
                    <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Sample 1:</span><br/>
                    <span className="text-sm font-bold text-slate-800">EC = {calc.ecVal.toFixed(1)} µS/cm → TDS ≈ {calc.tds.toFixed(1)} mg/L</span>
                  </div>
                )}
              </div>
            </CardWrapper>

            <CardWrapper gradientFrom="from-blue-500" gradientVia="via-indigo-500" gradientTo="to-violet-500" shadowColor="rgba(59,130,246,0.5)">
              <h4 className="font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 text-lg mb-2 drop-shadow-sm">Charge Balance Error (CBE)</h4>
              <p className="text-xs text-slate-600 mb-4 font-medium">
                CBE is used to verify the accuracy of water analysis. It compares the sum of cations (in meq/L) to the sum of anions.
              </p>
              <div className="bg-gradient-to-b from-slate-50 to-white p-4 rounded-2xl border border-slate-100 shadow-[inset_0_2px_10px_rgba(0,0,0,0.02)] text-xs text-slate-700 flex-1 flex flex-col justify-center">
                <div className="font-mono text-center font-bold text-slate-800 bg-white p-3 rounded-xl border border-slate-200 shadow-sm space-y-2 mb-3 text-[10px]">
                  <div>TZ⁺ = Ca²⁺ + Mg²⁺ + Na⁺ + K⁺</div>
                  <div>TZ⁻ = HCO₃⁻ + CO₃²⁻ + Cl⁻ + SO₄²⁻</div>
                  <div className="text-indigo-700">CBE (%) = [(TZ⁺ - TZ⁻) / (TZ⁺ + TZ⁻)] × 100</div>
                </div>
                {cbe !== null && (
                  <div className="text-center">
                    <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Sample 1 CBE:</span><br/>
                    <span className="text-sm font-bold text-slate-800">{cbe > 0 ? "+" : ""}{cbe.toFixed(2)}%</span>
                  </div>
                )}
              </div>
            </CardWrapper>

          </div>

          {/* Section 2: Agricultural Indices */}
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Waves className="w-5 h-5 text-cyan-500" />
              Irrigation & Soil Suitability Indices
            </h3>

            <CardWrapper gradientFrom="from-cyan-500" gradientVia="via-sky-500" gradientTo="to-blue-500" shadowColor="rgba(6,182,212,0.5)">
              <h4 className="font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-600 to-sky-600 text-lg mb-2 drop-shadow-sm">Sodium Adsorption Ratio (SAR)</h4>
              <p className="text-xs text-slate-600 mb-4 font-medium">
                SAR quantifies the proportion of sodium to calcium and magnesium. (meq/L)
              </p>
              <div className="bg-gradient-to-b from-slate-50 to-white p-4 rounded-2xl border border-slate-100 shadow-[inset_0_2px_10px_rgba(0,0,0,0.02)] text-xs text-slate-700 flex-1 flex flex-col justify-center">
                <div className="font-mono text-center font-bold text-slate-800 bg-white p-3 rounded-xl border border-slate-200 shadow-sm mb-3">
                  SAR = Na⁺ / √[(Ca²⁺ + Mg²⁺) / 2]
                </div>
                {calc && calc.sar !== undefined && (
                  <div className="text-center">
                    <span className="text-[10px] font-black text-cyan-600 uppercase tracking-widest">Sample 1 SAR:</span><br/>
                    <span className="text-sm font-bold text-slate-800">{calc.sar.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </CardWrapper>

            <CardWrapper gradientFrom="from-orange-500" gradientVia="via-amber-500" gradientTo="to-yellow-500" shadowColor="rgba(249,115,22,0.5)">
              <h4 className="font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-amber-600 text-lg mb-2 drop-shadow-sm">Residual Sodium Carbonate (RSC)</h4>
              <p className="text-xs text-slate-600 mb-4 font-medium">
                RSC indicates the hazard of carbonate and bicarbonate in relation to calcium and magnesium. (meq/L)
              </p>
              <div className="bg-gradient-to-b from-slate-50 to-white p-4 rounded-2xl border border-slate-100 shadow-[inset_0_2px_10px_rgba(0,0,0,0.02)] text-xs text-slate-700 flex-1 flex flex-col justify-center">
                <div className="font-mono text-center font-bold text-slate-800 bg-white p-3 rounded-xl border border-slate-200 shadow-sm mb-3 text-[10px]">
                  RSC = (CO₃²⁻ + HCO₃⁻) - (Ca²⁺ + Mg²⁺)
                </div>
                {rsc !== null && (
                  <div className="text-center">
                    <span className="text-[10px] font-black text-orange-600 uppercase tracking-widest">Sample 1 RSC:</span><br/>
                    <span className="text-sm font-bold text-slate-800">{rsc.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </CardWrapper>

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

          {/* Section 3: Classifications */}
          <div className="space-y-6 lg:col-span-2 mt-4 pt-6 border-t border-slate-100">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-indigo-500" />
              Plotting Classifications
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <CardWrapper gradientFrom="from-rose-500" gradientVia="via-pink-500" gradientTo="to-fuchsia-500" shadowColor="rgba(244,63,94,0.5)">
                <h4 className="font-black text-transparent bg-clip-text bg-gradient-to-r from-rose-600 to-pink-600 text-lg mb-2 drop-shadow-sm">USSL Salinity & Sodicity</h4>
                <p className="text-xs text-slate-600 mb-4 font-medium">
                  Classifies water for irrigation using Salinity (EC) and Sodicity (SAR).
                </p>
                <div className="bg-gradient-to-b from-slate-50 to-white p-5 rounded-2xl border border-slate-100 shadow-[inset_0_2px_10px_rgba(0,0,0,0.02)] text-xs text-slate-700 flex-1 flex flex-col">
                  
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-white p-3 rounded-xl border border-rose-100 shadow-sm">
                      <p className="font-bold text-rose-700 mb-1 border-b border-rose-50 pb-1 text-[10px] uppercase">Salinity (EC)</p>
                      <ul className="space-y-1 text-[9px] font-medium text-slate-600">
                        <li><strong>C1</strong>: &lt; 250</li>
                        <li><strong>C2</strong>: 250 - 750</li>
                        <li><strong>C3</strong>: 750 - 2250</li>
                        <li><strong>C4</strong>: &ge; 2250</li>
                      </ul>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-pink-100 shadow-sm">
                      <p className="font-bold text-pink-700 mb-1 border-b border-pink-50 pb-1 text-[10px] uppercase">Sodicity (SAR)</p>
                      <ul className="space-y-1 text-[9px] font-medium text-slate-600">
                        <li><strong>S1</strong>: Low</li>
                        <li><strong>S2</strong>: Medium</li>
                        <li><strong>S3</strong>: High</li>
                        <li><strong>S4</strong>: Very High</li>
                      </ul>
                    </div>
                  </div>

                  {calc && calc.ussl && (
                    <div className="mt-auto text-center bg-rose-50 p-3 rounded-xl border border-rose-200">
                      <span className="text-[10px] font-black text-rose-600 uppercase tracking-widest">Sample 1 Classification:</span><br/>
                      <span className="text-lg font-black text-slate-800">{calc.ussl}</span>
                    </div>
                  )}
                </div>
              </CardWrapper>

              <CardWrapper gradientFrom="from-indigo-500" gradientVia="via-purple-500" gradientTo="to-fuchsia-500" shadowColor="rgba(168,85,247,0.5)">
                <h4 className="font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-lg mb-2 drop-shadow-sm">Piper Trilinear Facies</h4>
                <p className="text-xs text-slate-600 mb-4 font-medium">
                  Determines dominant water type based on relative proportions (%) of cations and anions.
                </p>
                <div className="bg-gradient-to-b from-slate-50 to-white p-5 rounded-2xl border border-slate-100 shadow-[inset_0_2px_10px_rgba(0,0,0,0.02)] text-xs text-slate-700 flex-1 flex flex-col">
                  
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <p className="font-bold text-indigo-700 mb-2 border-b border-indigo-100 pb-1">Cation Types</p>
                      <ul className="space-y-1.5 font-medium text-[10px]">
                        <li className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>Ca &gt; 50%</li>
                        <li className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>Mg &gt; 50%</li>
                        <li className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>Na+K &gt; 50%</li>
                      </ul>
                    </div>
                    
                    <div>
                      <p className="font-bold text-fuchsia-700 mb-2 border-b border-fuchsia-100 pb-1">Anion Types</p>
                      <ul className="space-y-1.5 font-medium text-[10px]">
                        <li className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>HCO3+CO3 &gt; 50%</li>
                        <li className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-cyan-500"></span>SO4 &gt; 50%</li>
                        <li className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-violet-500"></span>Cl &gt; 50%</li>
                      </ul>
                    </div>
                  </div>

                  <div className="mb-4">
                    <p className="font-black text-slate-800 mb-2 text-[11px]">Detailed Mixed Facies Classification:</p>
                    <div className="space-y-2 text-[10px]">
                      <div className="bg-white p-2.5 rounded-xl border border-emerald-100 shadow-sm flex flex-col gap-1">
                        <strong className="text-emerald-700">Mixed Type A</strong>
                        <span className="text-slate-600">Alkaline Earths (Ca+Mg) &ge; 50% <strong>AND</strong> Strong Acids (Cl+SO4) &ge; 50%<br/><span className="text-emerald-600 font-medium">but their sum is &lt; 150%</span></span>
                      </div>
                      
                      <div className="bg-white p-2.5 rounded-xl border border-rose-100 shadow-sm flex flex-col gap-1">
                        <strong className="text-rose-700">Mixed Type B</strong>
                        <span className="text-slate-600">Alkalies (Na+K) &gt; 50% <strong>AND</strong> Weak Acids (HCO3+CO3) &gt; 50%<br/><span className="text-rose-600 font-medium">but Alkaline Earths + Strong Acids &ge; 50%</span></span>
                      </div>
                    </div>
                  </div>

                  {calc && calc.facies && (
                    <div className="mt-auto text-center bg-fuchsia-50 p-3 rounded-xl border border-fuchsia-200">
                      <span className="text-[10px] font-black text-fuchsia-600 uppercase tracking-widest">Sample 1 Facies:</span><br/>
                      <span className="text-sm font-black text-slate-800">{calc.facies}</span>
                    </div>
                  )}

                </div>
              </CardWrapper>

            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
};

export default CalculatoriusView;
