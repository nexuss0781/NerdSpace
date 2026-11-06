export interface SymbolSequence {
  code: string;
  symbol: string;
  name: string;
}

export const SYMBOL_SEQUENCES: SymbolSequence[] = [
  { code: "bang", symbol: "!", name: "exclamation" },
  { code: "at", symbol: "@", name: "at" },
  { code: "hash", symbol: "#", name: "hash" },
  { code: "dollar", symbol: "$", name: "dollar" },
  { code: "percent", symbol: "%", name: "percent" },
  { code: "caret", symbol: "^", name: "caret" },
  { code: "amp", symbol: "&", name: "ampersand" },
  { code: "star", symbol: "*", name: "asterisk" },
  { code: "lpar", symbol: "(", name: "left parenthesis" },
  { code: "rpar", symbol: ")", name: "right parenthesis" },
  { code: "minus", symbol: "-", name: "minus" },
  { code: "underscore", symbol: "_", name: "underscore" },
  { code: "equal", symbol: "=", name: "equals" },
  { code: "plus", symbol: "+", name: "plus" },
  { code: "lbracket", symbol: "[", name: "left bracket" },
  { code: "rbracket", symbol: "]", name: "right bracket" },
  { code: "lbrace", symbol: "{", name: "left brace" },
  { code: "rbrace", symbol: "}", name: "right brace" },
  { code: "backslash", symbol: "\\", name: "backslash" },
  { code: "pipe", symbol: "|", name: "vertical bar" },
  { code: "semicolon", symbol: ";", name: "semicolon" },
  { code: "colon", symbol: ":", name: "colon" },
  { code: "quote", symbol: "'", name: "single quote" },
  { code: "dquote", symbol: '"', name: "double quote" },
  { code: "comma", symbol: ",", name: "comma" },
  { code: "less", symbol: "<", name: "less than" },
  { code: "dot", symbol: ".", name: "period" },
  { code: "greater", symbol: ">", name: "greater than" },
  { code: "slash", symbol: "/", name: "slash" },
  { code: "question", symbol: "?", name: "question mark" },
  { code: "tilde", symbol: "~", name: "tilde" },
  { code: "backtick", symbol: "`", name: "backtick" },
];

export const SYMBOL_BY_CODE = Object.fromEntries(
  SYMBOL_SEQUENCES.map(({ code, symbol }) => [code, symbol]),
) as Record<string, string>;
