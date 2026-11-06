import { Keyboard, X } from "lucide-react";
import { SYMBOL_SEQUENCES } from "@/lib/symbols";

interface SymbolPaletteProps {
  onClose: () => void;
}

export default function SymbolPalette({ onClose }: SymbolPaletteProps) {
  return (
    <section className="symbol-palette" aria-label="Alphabet symbol keys">
      <div className="symbol-palette__heading">
        <div className="symbol-palette__title"><span className="symbol-key-icon"><Keyboard size={15} /></span><div><strong>Alphabet keys</strong><span>Type a code, then Space</span></div></div>
        <button className="icon-button" aria-label="Close alphabet keys" onClick={onClose}><X size={16} /></button>
      </div>
      <div className="symbol-palette__grid">
        {SYMBOL_SEQUENCES.map(({ code, symbol, name }) => (
          <div className="symbol-palette__item" key={code} title={`${name}: type ${code}, then Space`}>
            <kbd>{code}</kbd><span className="symbol-palette__arrow">→</span><span className="symbol-palette__symbol">{symbol}</span>
          </div>
        ))}
      </div>
      <p className="symbol-palette__note">ABC mode blocks punctuation keys. A matching letter code inserts the original symbol.</p>
    </section>
  );
}
