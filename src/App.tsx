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
      text: "¡Hola! Soy tu asistente documental. Puedes usar el documento de la izquierda o **subir tu propio PDF** para hacerme preguntas.",
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
          systemInstruction: `Eres un Asistente Documental experto. Tu tarea es responder preguntas basándote ÚNICAMENTE en el siguiente documento proporcionado por el usuario. 
          
          REGLAS:
          1. Si la respuesta está en el documento, responde de forma detallada.
          2. Si la información NO está en el documento, di: "Lo siento, esa información no se encuentra en el documento actual."
          3. No uses conocimientos externos a menos que sea para explicar un término que aparece en el texto.
          
          DOCUMENTO DE CONTEXTO:
          ${currentContent}
          
          Responde de forma clara y profesional en español.`
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
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      {/* LADO IZQUIERDO: Visualizador de Documento (Simulación PDF) */}
      <div className={`transition-all duration-300 ease-in-out bg-white border-r border-slate-200 flex flex-col ${isSidebarOpen ? 'w-1/2' : 'w-0 opacity-0'}`}>
        <div className="p-4 bg-slate-800 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2 overflow-hidden">
            <FileText size={20} className="text-amber-400 shrink-0" />
            <span className="font-bold text-sm uppercase tracking-wider truncate" title={fileName}>
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
              className="hover:text-amber-400 transition-colors flex items-center gap-1 text-xs font-bold"
              title="Subir nuevo archivo"
              disabled={isProcessingFile}
            >
              {isProcessingFile ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              <span className="hidden lg:inline">{isProcessingFile ? 'PROCESANDO...' : 'SUBIR'}</span>
            </button>
            <button 
              onClick={resetToDefault}
              className="hover:text-amber-400 transition-colors"
              title="Restablecer original"
            >
              <RefreshCw size={16} />
            </button>
            <button onClick={() => setIsSidebarOpen(false)} className="hover:text-amber-400 transition-colors">
              <Minimize2 size={18} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-8 md:p-12 bg-slate-50">
          <div className="max-w-2xl mx-auto bg-white shadow-sm p-10 border border-slate-200 min-h-full">
            <div className="prose prose-slate max-w-none">
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

        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center gap-4 bg-white">
          <div className="bg-[#2e7d32] text-white p-3 rounded-full">
            <Bot size={24} />
          </div>
          <div>
            <h3 className="m-0 text-lg font-bold text-slate-800">Asistente RAG V2</h3>
            <small className="text-slate-500">Analista de documentos</small>
          </div>
        </div>

        {/* Chat Window */}
        <div 
          ref={chatWindowRef}
          className="flex-1 p-5 overflow-y-auto flex flex-col gap-4 bg-slate-50"
        >
          {messages.map((msg, i) => (
            <div 
              key={i} 
              className={`max-w-[85%] p-3 px-4 rounded-2xl leading-relaxed text-sm flex items-start gap-2 ${
                msg.type === 'bot-msg' 
                  ? 'bot-msg self-start rounded-bl-none shadow-sm' 
                  : 'user-msg self-end rounded-br-none shadow-md'
              }`}
            >
              {msg.isLoading && <Loader2 size={16} className="animate-spin mt-1 shrink-0" />}
              <div className="prose prose-sm max-w-none prose-p:leading-relaxed prose-strong:text-inherit">
                <ReactMarkdown>{msg.text}</ReactMarkdown>
              </div>
            </div>
          ))}
        </div>

        {/* Input Area */}
        <div className="p-5 flex gap-3 border-t border-slate-100 bg-white">
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Pregunta sobre el documento..."
            className="flex-1 p-3 px-5 border border-slate-200 rounded-full outline-none focus:ring-2 focus:ring-[#2e7d32] transition-all"
            disabled={isTyping}
          />
          <button 
            onClick={handleSend}
            disabled={isTyping}
            className="bg-[#2e7d32] text-white p-3 px-6 rounded-full hover:bg-[#1b5e20] transition-colors flex items-center justify-center disabled:opacity-50"
          >
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
