import React, { useState, useRef, useEffect } from 'react';
import { Leaf, Bot, Send, Loader2, FileText, Maximize2, Minimize2, Upload, RefreshCw, AlertCircle } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import { monographContent } from './data/monograph';
import * as pdfjs from 'pdfjs-dist';

// Configurar el worker de PDF.js de forma compatible con Vite
// Usamos un CDN estable para evitar problemas de resolución de módulos en el navegador
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@5.5.207/build/pdf.worker.min.mjs`;

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

interface Message {
  text: string;
  type: 'bot-msg' | 'user-msg';
  isLoading?: boolean;
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      text: "¡Bienvenido a AgroExpert AI! Soy tu **Agrónomo Virtual**. Sube un manual de cultivo en PDF y te ayudaré con el control de plagas, riego y nutrición.",
      type: 'bot-msg'
    }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [currentContent, setCurrentContent] = useState(monographContent);
  const [fileName, setFileName] = useState('Monografía_Hidroponia.pdf');
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const chatWindowRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  }, [messages]);

  const extractTextFromPDF = async (data: ArrayBuffer) => {
    try {
      const loadingTask = pdfjs.getDocument({ data });
      const pdf = await loadingTask.promise;
      let fullText = '';
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .filter((item: any) => 'str' in item)
          .map((item: any) => item.str)
          .join(' ');
        fullText += pageText + '\n\n';
      }
      
      if (!fullText.trim()) {
        throw new Error("El PDF no contiene texto legible (podría ser una imagen escaneada).");
      }
      
      return fullText;
    } catch (err) {
      console.error("PDF Extraction Error:", err);
      throw err;
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessingFile(true);
    setMessages(prev => [...prev, { text: `Procesando archivo: **${file.name}**...`, type: 'bot-msg', isLoading: true }]);

    try {
      let content = '';
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        const arrayBuffer = await file.arrayBuffer();
        content = await extractTextFromPDF(arrayBuffer);
      } else {
        content = await file.text();
      }

      setCurrentContent(content || 'No se pudo extraer texto del archivo.');
      setFileName(file.name);
      
      setMessages(prev => {
        const filtered = prev.filter(m => !m.isLoading);
        return [...filtered, {
          text: `He analizado el nuevo documento: **${file.name}**. Ya puedes hacerme preguntas sobre su contenido.`,
          type: 'bot-msg'
        }];
      });
    } catch (error) {
      console.error('Error al procesar el archivo:', error);
      const errorDetail = error instanceof Error ? error.message : "Error desconocido";
      setMessages(prev => {
        const filtered = prev.filter(m => !m.isLoading);
        return [...filtered, {
          text: `Hubo un error al leer el archivo (**${errorDetail}**). Asegúrate de que sea un PDF con texto (no escaneado) o un archivo de texto plano.`,
          type: 'bot-msg'
        }];
      });
    } finally {
      setIsProcessingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const resetToDefault = () => {
    setCurrentContent(monographContent);
    setFileName('Monografía_Hidroponia.pdf');
    setMessages([{
      text: "He vuelto al documento original sobre **Hidroponía**. ¿En qué puedo ayudarte?",
      type: 'bot-msg'
    }]);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isTyping || isProcessingFile) return;

    setMessages(prev => [...prev, { text, type: 'user-msg' }]);
    setInput('');
    setIsTyping(true);

    const loadingMessage: Message = { text: "Consultando el documento...", type: 'bot-msg', isLoading: true };
    setMessages(prev => [...prev, loadingMessage]);

    try {
      const model = "gemini-3-flash-preview";
      const response = await genAI.models.generateContent({
        model,
        contents: [{
          parts: [{ text }]
        }],
        config: {
          systemInstruction: `Eres un Agrónomo Experto y Analista de Cultivos. Tu tarea es responder preguntas técnicas basándote ÚNICAMENTE en el manual o documento de agricultura proporcionado. 
          
          REGLAS DE EXPERTO:
          1. Responde con terminología técnica agrícola adecuada (riego, fertilización, fitosanidad, etc.).
          2. Si la respuesta está en el documento, explica los pasos de forma clara para un agricultor.
          3. Si la información NO está en el documento, di: "Esa información específica no se encuentra en el manual actual de cultivo."
          4. Mantén un tono profesional, servicial y experto en el campo.
          
          DOCUMENTO DE CULTIVO:
          ${currentContent}
          
          Responde en español de forma estructurada.`
        }
      });

      const botResponse = response.text || "Lo siento, no pude encontrar esa información en el documento.";

      setMessages(prev => {
        const filtered = prev.filter(m => !m.isLoading);
        return [...filtered, { text: botResponse, type: 'bot-msg' }];
      });

    } catch (error) {
      console.error("Error:", error);
      setMessages(prev => {
        const filtered = prev.filter(m => !m.isLoading);
        return [...filtered, { text: "Error al conectar con el asistente. Por favor, intenta de nuevo.", type: 'bot-msg' }];
      });
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* Navigation Bar */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-2">
              <div className="bg-[#2e7d32] p-2 rounded-lg text-white">
                <Leaf size={20} />
              </div>
              <span className="text-xl font-bold tracking-tight text-slate-800">Agro<span className="text-[#2e7d32]">Expert</span> AI</span>
            </div>
            <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
              <a href="#" className="hover:text-[#2e7d32] transition-colors">Inicio</a>
              <a href="#" className="hover:text-[#2e7d32] transition-colors">Guías de Cultivo</a>
              <a href="#" className="hover:text-[#2e7d32] transition-colors">Soporte Técnico</a>
              <button className="bg-[#2e7d32] text-white px-5 py-2 rounded-full hover:bg-[#1b5e20] transition-all shadow-sm">
                Consultar Experto
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="py-16 bg-gradient-to-b from-white to-slate-50 border-b border-slate-100">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-6xl font-black text-slate-900 mb-6 tracking-tight leading-tight">
            Análisis Inteligente de <span className="text-[#2e7d32]">Manuales de Cultivo</span>
          </h1>
          <p className="text-lg text-slate-600 mb-10 max-w-2xl mx-auto leading-relaxed">
            Sube tus manuales técnicos de agricultura, guías de riego o fichas de plagas en PDF. 
            Nuestro experto agrónomo virtual analizará el contenido para resolver tus dudas al instante.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full border border-slate-200 shadow-sm text-sm text-slate-500">
              <Leaf size={16} className="text-[#2e7d32]" />
              Especializado en Papa, Pepino e Hidroponía
            </div>
          </div>
        </div>
      </header>

      {/* Main App Section (The RAG Assistant) */}
      <main className="max-w-7xl mx-auto px-4 py-12">
        <div className="bg-white rounded-3xl shadow-2xl shadow-slate-200/50 border border-slate-200 overflow-hidden flex flex-col md:flex-row h-[800px]">
          
          {/* LADO IZQUIERDO: Visualizador de Documento */}
          <div className={`transition-all duration-500 ease-in-out bg-slate-50 border-r border-slate-200 flex flex-col ${isSidebarOpen ? 'w-full md:w-1/2' : 'w-0 opacity-0 overflow-hidden'}`}>
            <div className="p-4 bg-slate-800 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2 overflow-hidden">
                <FileText size={18} className="text-amber-400 shrink-0" />
                <span className="font-bold text-xs uppercase tracking-widest truncate" title={fileName}>
                  {fileName}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                  className="hidden" 
                  accept=".pdf,.txt,.md,.json,.js,.ts"
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="hover:text-amber-400 transition-colors flex items-center gap-1 text-[10px] font-black tracking-tighter"
                  title="Subir nuevo archivo"
                  disabled={isProcessingFile}
                >
                  {isProcessingFile ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  <span>{isProcessingFile ? 'PROCESANDO...' : 'SUBIR'}</span>
                </button>
                <button 
                  onClick={resetToDefault}
                  className="hover:text-amber-400 transition-colors"
                  title="Restablecer original"
                >
                  <RefreshCw size={14} />
                </button>
                <button onClick={() => setIsSidebarOpen(false)} className="hover:text-amber-400 transition-colors">
                  <Minimize2 size={16} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 md:p-10 bg-slate-100/50">
              <div className="max-w-2xl mx-auto bg-white shadow-sm p-8 md:p-12 border border-slate-200 min-h-full rounded-sm">
                <div className="prose prose-slate prose-sm max-w-none">
                  <ReactMarkdown>{currentContent}</ReactMarkdown>
                </div>
              </div>
            </div>
          </div>

          {/* LADO DERECHO: Chatbot Interactivo */}
          <div className="flex-1 flex flex-col bg-white relative">
            {!isSidebarOpen && (
              <button 
                onClick={() => setIsSidebarOpen(true)}
                className="absolute top-4 left-4 z-10 bg-slate-800 text-white p-2 rounded-lg shadow-lg hover:bg-slate-700 transition-all"
                title="Ver Documento"
              >
                <Maximize2 size={20} />
              </button>
            )}

            {/* Header del Chat */}
            <div className="p-5 border-b border-slate-100 flex items-center gap-4 bg-white shrink-0">
              <div className="bg-[#2e7d32] text-white p-2.5 rounded-xl shadow-inner">
                <Bot size={22} />
              </div>
              <div>
                <h3 className="m-0 text-base font-bold text-slate-800 leading-none mb-1">Asistente Inteligente</h3>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Listo para analizar</span>
                </div>
              </div>
            </div>

            {/* Chat Window */}
            <div 
              ref={chatWindowRef}
              className="flex-1 p-6 overflow-y-auto flex flex-col gap-5 bg-slate-50/30"
            >
              {messages.map((msg, i) => (
                <div 
                  key={i} 
                  className={`max-w-[90%] md:max-w-[80%] p-4 rounded-2xl leading-relaxed text-sm flex items-start gap-3 ${
                    msg.type === 'bot-msg' 
                      ? 'bg-white border border-slate-100 self-start rounded-bl-none shadow-sm text-slate-700' 
                      : 'bg-[#2e7d32] text-white self-end rounded-br-none shadow-md'
                  }`}
                >
                  {msg.isLoading && <Loader2 size={16} className="animate-spin mt-1 shrink-0 opacity-50" />}
                  <div className="prose prose-sm max-w-none prose-p:leading-relaxed prose-strong:text-inherit prose-headings:text-inherit text-inherit">
                    <ReactMarkdown>{msg.text}</ReactMarkdown>
                  </div>
                </div>
              ))}
            </div>

            {/* Input Area */}
            <div className="p-6 bg-white border-t border-slate-100">
              <div className="relative flex items-center">
                <input 
                  type="text" 
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Haz una pregunta sobre el documento..."
                  className="w-full p-4 pr-16 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-[#2e7d32]/20 focus:border-[#2e7d32] transition-all text-sm"
                  disabled={isTyping || isProcessingFile}
                />
                <button 
                  onClick={handleSend}
                  disabled={isTyping || isProcessingFile || !input.trim()}
                  className="absolute right-2 bg-[#2e7d32] text-white p-2.5 rounded-xl hover:bg-[#1b5e20] transition-all flex items-center justify-center disabled:opacity-30 shadow-lg shadow-[#2e7d32]/20"
                >
                  <Send size={18} />
                </button>
              </div>
              <p className="text-[10px] text-center text-slate-400 mt-3 uppercase tracking-widest font-medium">
                Potenciado por Gemini 3 Flash
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-12 mt-12">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <div className="flex justify-center gap-6 mb-8">
            <a href="#" className="text-slate-400 hover:text-[#2e7d32] transition-colors"><FileText size={20} /></a>
            <a href="#" className="text-slate-400 hover:text-[#2e7d32] transition-colors"><Bot size={20} /></a>
            <a href="#" className="text-slate-400 hover:text-[#2e7d32] transition-colors"><Leaf size={20} /></a>
          </div>
          <p className="text-slate-500 text-sm">
            © 2026 DocuExpert AI. Todos los derechos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}
