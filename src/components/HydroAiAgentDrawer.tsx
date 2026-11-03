import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  Bot,
  X,
  Send,
  Loader2,
  Copy,
  Check,
  Download,
  Trash2,
  Maximize2,
  Minimize2,
  ChevronRight,
  ShieldAlert,
  Droplets,
  Layers,
  Sprout,
  HelpCircle,
  RotateCcw,
} from "lucide-react";

export interface HydroContextSummary {
  totalSamples: number;
  filteredSamples: number;
  selectedState?: string;
  selectedDistrict?: string;
  selectedBlock?: string;
  selectedAquifer?: string;
  selectedSeason?: string;
  selectedYear?: string;
  faciesBreakdown?: Record<string, number>;
  usslBreakdown?: Record<string, number>;
  exceedances?: {
    parameter: string;
    count: number;
    maxVal: number;
    unit: string;
    limit: number;
  }[];
  avgParameters?: {
    ec?: number;
    sar?: number;
    tds?: number;
    ph?: number;
    fluoride?: number;
    nitrate?: number;
  };
}

interface Message {
  id: string;
  role: "user" | "model";
  content: string;
  timestamp: string;
  isError?: boolean;
  lastQuery?: string;
  fallbackNote?: string;
}

interface HydroAiAgentDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  context: HydroContextSummary;
}

const QUICK_PROMPTS = [
  {
    id: "full_audit",
    icon: Sparkles,
    label: "Executive Hydrogeological Audit",
    prompt:
      "Generate an executive hydrogeological bulletin auditing the current filtered dataset. Synthesize the Piper facies, USSL irrigation classes, Gibbs mechanisms, and any BIS IS 10500 parameter exceedances with actionable recommendations.",
  },
  {
    id: "irrigation",
    icon: Sprout,
    label: "Irrigation & USSL Hazard Evaluation",
    prompt:
      "Evaluate the agricultural and irrigation suitability of this groundwater based on the USSL classification (C-S classes), SAR, and EC. Which regional crops (e.g., wheat, rice, pulses, vegetables) can safely be irrigated, and what soil management practices should farmers apply?",
  },
  {
    id: "facies",
    icon: Layers,
    label: "Piper Facies & Aquifer Process",
    prompt:
      "Interpret the hydrochemical facies identified in the Piper diagram. What geochemical mechanisms (such as precipitation recharge, carbonate rock weathering, silicate hydrolysis, or ion exchange) are shaping this groundwater chemistry?",
  },
  {
    id: "potability",
    icon: Droplets,
    label: "Drinking Water Safety (BIS IS 10500)",
    prompt:
      "Review the drinking water potability against Bureau of Indian Standards (BIS IS 10500:2012). Detail any health risks associated with the identified exceedances (such as Fluoride or Nitrate) and recommend appropriate community-level water treatment or mitigation.",
  },
];

export const HydroAiAgentDrawer: React.FC<HydroAiAgentDrawerProps> = ({
  isOpen,
  onClose,
  context,
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "model",
      content: `Hello! I am **AquaIntel**, your AI Hydrogeologist & Groundwater Compliance Specialist.\n\nI am synchronized with your active groundwater dataset (${context.filteredSamples} samples loaded). I can analyze **Piper trilinear facies**, **USSL irrigation salinity/alkali hazards**, **Gibbs mechanisms**, and **BIS IS 10500 potability compliance**.\n\nSelect a quick analysis topic below or ask me any question about your aquifer data!`,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom of conversation
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  // Focus textarea when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 250);
    }
  }, [isOpen]);

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: query,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    if (!textToSend) setInput("");
    setIsLoading(true);

    try {
      // Prepare payload for server-side Gemini endpoint
      const payloadMessages = newMessages
        .filter((m) => m.id !== "welcome")
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: payloadMessages,
          context: {
            samplesCount: context.filteredSamples,
            totalDatasetSamples: context.totalSamples,
            activeFilters: {
              state: context.selectedState || "All States",
              district: context.selectedDistrict || "All Districts",
              block: context.selectedBlock || "All Blocks",
              aquifer: context.selectedAquifer || "All Aquifers",
              season: context.selectedSeason || "All Seasons",
              year: context.selectedYear || "All Years",
            },
            faciesBreakdown: context.faciesBreakdown || {},
            usslBreakdown: context.usslBreakdown || {},
            exceedancesSummary: context.exceedances || [],
            averageParameters: context.avgParameters || {},
          },
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server responded with ${res.status}`);
      }

      const data = await res.json();
      const aiReply: Message = {
        id: (Date.now() + 1).toString(),
        role: "model",
        content: data.reply || "No response received.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        fallbackNote: data.fallbackNote,
      };

      setMessages((prev) => [...prev, aiReply]);
    } catch (err: any) {
      console.error("AI Chat Error:", err);
      let errorText = err?.message || "Failed to reach AI service";
      if (
        errorText.includes("503") ||
        errorText.includes("high demand") ||
        errorText.includes("UNAVAILABLE") ||
        errorText.includes("RESOURCE_EXHAUSTED")
      ) {
        errorText = "The AI service is experiencing a temporary surge in upstream traffic. Please click Retry below to re-submit your analysis.";
      }
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "model",
        content: `⚠️ **Notice**: ${errorText}`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        isError: true,
        lastQuery: query,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExportConversation = () => {
    const textContent = messages
      .map((m) => `[${m.timestamp}] ${m.role === "user" ? "USER" : "AQUAINTEL AI"}:\n${m.content}\n\n`)
      .join("---\n\n");
    const blob = new Blob([textContent], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `AquaIntel_Hydrogeology_Report_${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClearHistory = () => {
    setMessages([
      {
        id: "welcome-reset",
        role: "model",
        content: `Conversation refreshed! What hydrogeological insight or aquifer classification would you like to explore next?`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden pointer-events-none">
      {/* Backdrop for mobile */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-300 pointer-events-auto md:hidden"
        onClick={onClose}
      />

      {/* Drawer Container */}
      <div
        className={`absolute top-0 right-0 bottom-0 bg-white shadow-2xl flex flex-col pointer-events-auto border-l border-slate-200 transition-all duration-300 ${
          isExpanded ? "w-full md:w-[750px]" : "w-full sm:w-[480px] md:w-[520px]"
        }`}
      >
        {/* Drawer Header */}
        <div className="p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between shadow-md shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 shadow-inner">
              <Bot className="w-5 h-5 text-indigo-300 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-sm tracking-wide text-white flex items-center gap-1.5">
                  AquaIntel AI Agent
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Hydrogeologist
                </span>
              </div>
              <p className="text-[11px] text-slate-300 font-medium">
                Piper &bull; USSL &bull; Gibbs &bull; BIS IS 10500 Specialist
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 rounded-xl hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
              title={isExpanded ? "Collapse width" : "Expand width"}
            >
              {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              onClick={handleExportConversation}
              className="p-1.5 rounded-xl hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
              title="Export Conversation as Markdown"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={handleClearHistory}
              className="p-1.5 rounded-xl hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
              title="Clear chat history"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-white/10 text-slate-300 hover:text-white transition-colors ml-1"
              title="Close panel"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Live Context Synchronization Strip */}
        <div className="bg-indigo-50/80 px-4 py-2 border-b border-indigo-100 flex flex-wrap items-center justify-between gap-2 text-[10.5px] text-indigo-950 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            <span className="font-black text-indigo-900 uppercase tracking-wider text-[9.5px]">Live Sync:</span>
            <span className="font-bold text-slate-700">
              {context.filteredSamples} Samples Loaded
            </span>
            {(context.selectedDistrict || context.selectedState) && (
              <span className="bg-white/90 px-2 py-0.5 rounded-md border border-indigo-200 font-mono text-[10px] text-indigo-700">
                {[context.selectedDistrict, context.selectedState].filter(Boolean).join(", ")}
              </span>
            )}
          </div>

          {context.exceedances && context.exceedances.length > 0 && (
            <div className="flex items-center gap-1 text-amber-700 font-bold bg-amber-100/70 px-2 py-0.5 rounded-md text-[10px]">
              <ShieldAlert className="w-3 h-3 text-amber-600" />
              <span>{context.exceedances.length} Exceedances Detected</span>
            </div>
          )}
        </div>

        {/* Quick-Prompt Suggestions Toolbar */}
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 overflow-x-auto no-scrollbar flex items-center gap-2 shrink-0">
          <span className="text-[9.5px] font-black uppercase text-slate-400 tracking-wider whitespace-nowrap">
            Quick Actions:
          </span>
          {QUICK_PROMPTS.map((qp) => {
            const Icon = qp.icon;
            return (
              <button
                key={qp.id}
                onClick={() => handleSendMessage(qp.prompt)}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 text-slate-700 hover:text-indigo-800 text-[10.5px] font-bold whitespace-nowrap shadow-2xs transition-all cursor-pointer disabled:opacity-50"
              >
                <Icon className="w-3 h-3 text-indigo-600" />
                <span>{qp.label}</span>
              </button>
            );
          })}
        </div>

        {/* Messages Feed */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-100/50">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[90%] rounded-2xl p-4 shadow-sm text-xs leading-relaxed ${
                  m.role === "user"
                    ? "bg-indigo-600 text-white rounded-br-xs"
                    : "bg-white text-slate-800 border border-slate-200/90 rounded-bl-xs"
                }`}
              >
                {/* Header inside message */}
                <div className="flex items-center justify-between gap-4 mb-2 pb-1.5 border-b border-slate-200/40 text-[9.5px] font-bold opacity-75">
                  <span>{m.role === "user" ? "You" : "AquaIntel AI"}</span>
                  <div className="flex items-center gap-1.5">
                    <span>{m.timestamp}</span>
                    {m.role === "model" && (
                      <button
                        onClick={() => handleCopy(m.id, m.content)}
                        className="hover:text-indigo-600 transition-colors ml-1 p-0.5"
                        title="Copy markdown text"
                      >
                        {copiedId === m.id ? (
                          <Check className="w-3 h-3 text-emerald-500" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Message Content with structured markdown rendering */}
                <div className="prose prose-xs max-w-none break-words whitespace-pre-wrap font-sans text-xs">
                  {m.content}
                </div>

                {m.fallbackNote && (
                  <div className="mt-2.5 pt-2 border-t border-slate-200/60 text-[10px] text-indigo-700 font-bold flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                    <span>{m.fallbackNote}</span>
                  </div>
                )}

                {m.isError && m.lastQuery && (
                  <div className="mt-3 pt-2 border-t border-slate-200/60">
                    <button
                      type="button"
                      onClick={() => handleSendMessage(m.lastQuery)}
                      disabled={isLoading}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10.5px] shadow-sm transition-all cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Retry Analysis</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-2.5 bg-white p-3.5 rounded-2xl border border-slate-200/90 max-w-[80%] shadow-2xs">
              <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
              <span className="text-[11px] font-bold text-slate-600 animate-pulse">
                AquaIntel is evaluating hydrochemical facies and water parameters...
              </span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-3.5 bg-white border-t border-slate-200 shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-end gap-2 bg-slate-50 border border-slate-300 focus-within:border-indigo-600 focus-within:ring-2 focus-within:ring-indigo-100 rounded-2xl p-2 transition-all shadow-inner"
          >
            <textarea
              ref={inputRef}
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Ask AquaIntel about Piper facies, USSL classes, crop suitability, or remediation..."
              className="flex-1 bg-transparent border-0 outline-hidden resize-none text-xs text-slate-800 placeholder:text-slate-400 p-1"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white p-2 rounded-xl transition-all shadow-xs cursor-pointer disabled:cursor-not-allowed shrink-0"
              title="Send question to AI"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </form>
          <div className="flex items-center justify-between text-[9.5px] text-slate-400 px-1 mt-1.5 font-medium">
            <span>Powered by Google Gemini &bull; Hydrogeological Analysis Engine</span>
            <span>Shift + Enter for new line</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HydroAiAgentDrawer;
