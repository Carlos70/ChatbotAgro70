import React, { useState, useRef, useEffect } from 'react';
import { Leaf, Bot, Send, Loader2 } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import ReactMarkdown from 'react-markdown';

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

interface Message {
  text: string;
  type: 'bot-msg' | 'user-msg';
  isLoading?: boolean;
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      text: "¡Hola! Soy tu asistente agrícola. Puedo darte información detallada sobre la siembra de **Papa** o **Pepino**. ¿Por cuál quieres empezar?",
      type: 'bot-msg'
    }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatWindowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isTyping) return;

    // 1. Mostrar mensaje del usuario
    setMessages(prev => [...prev, { text, type: 'user-msg' }]);
    setInput('');
    setIsTyping(true);

    // 2. Mostrar indicador de "Escribiendo..."
    const loadingMessage: Message = { text: "El experto está pensando...", type: 'bot-msg', isLoading: true };
    setMessages(prev => [...prev, loadingMessage]);

    try {
      const model = "gemini-3-flash-preview"; // Cambiado a un modelo soportado y más potente
      const response = await genAI.models.generateContent({
        model,
        contents: [{
          parts: [{ text }]
        }],
        config: {
          systemInstruction: `Actúa como un agrónomo experto. Responde de forma detallada pero clara en español. 
                   Tu especialidad es la agricultura, específicamente el cultivo de papas y pepinos.
                   Si la pregunta no es sobre agricultura, papas o pepinos, recuérdale 
                   amablemente al usuario tu especialidad. Usa un tono profesional y servicial.`
        }
      });

      const botResponse = response.text || "Lo siento, no pude obtener una respuesta.";

      // 5. Quitar mensaje de carga y poner la respuesta real
      setMessages(prev => {
        const filtered = prev.filter(m => !m.isLoading);
        return [...filtered, { text: botResponse, type: 'bot-msg' }];
      });

    } catch (error) {
      console.error("Error:", error);
      setMessages(prev => {
        const filtered = prev.filter(m => !m.isLoading);
        return [...filtered, { text: "Error al conectar con el experto. Por favor, intenta de nuevo.", type: 'bot-msg' }];
      });
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="flex h-screen font-sans">
      {/* Sidebar */}
      <div className="w-[300px] sidebar text-white p-5 shadow-lg overflow-y-auto hidden md:block">
        <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
          <Leaf size={24} /> Guía Rápida
        </h2>
        
        <div className="bg-white/10 rounded-xl p-4 mb-4 text-sm">
          <h3 className="text-lg font-bold mb-2">🥔 La Papa</h3>
          <p className="mb-1"><strong>Clima:</strong> Templado/Frío (15-20°C).</p>
          <p className="mb-1"><strong>Suelo:</strong> Suelto, bien drenado, pH 5.5-6.5.</p>
          <p><strong>Distancia:</strong> 30cm entre plantas.</p>
        </div>

        <div className="bg-white/10 rounded-xl p-4 mb-4 text-sm">
          <h3 className="text-lg font-bold mb-2">🥒 El Pepino</h3>
          <p className="mb-1"><strong>Clima:</strong> Cálido (20-30°C), mucho sol.</p>
          <p className="mb-1"><strong>Suelo:</strong> Rico en materia orgánica.</p>
          <p><strong>Tip:</strong> Requiere tutores (guías) para crecer.</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col max-w-[900px] mx-auto bg-white shadow-2xl">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center gap-4">
          <div className="bg-[#2e7d32] text-white p-3 rounded-full">
            <Bot size={24} />
          </div>
          <div>
            <h3 className="m-0 text-lg font-bold text-slate-800">AgroAsistente V1</h3>
            <small className="text-slate-500">Especialista en hortalizas</small>
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
              className={`max-w-[80%] p-3 px-4 rounded-2xl leading-relaxed text-sm flex items-start gap-2 ${
                msg.type === 'bot-msg' 
                  ? 'bot-msg self-start rounded-bl-none' 
                  : 'user-msg self-end rounded-br-none'
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
            placeholder="Pregúntame sobre profundidad, riego o abono..."
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
