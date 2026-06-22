export interface InputFieldDoc {
  label: string;
  type: string;
  placeholder: string;
  name: string;
  validationRules?: string[]; // Regras HTML5 como ["required", "maxlength: 100"]
}

export interface ButtonDoc {
  text: string;
  type: string;
}

export interface PageDocData {
  pageName: string;
  path: string;
  title: string;
  h1: string;
  description: string;
  inputs: InputFieldDoc[];
  buttons: ButtonDoc[];
  screenshotFilename?: string;
  screenshotPath?: string;
  businessRules?: BusinessRule[];
}

export interface BusinessRule {
  id: string;
  pagePath: string;
  pageName: string;
  fieldName: string;
  fieldLabel: string;
  validationRule: string; // Ex: "Obrigatório", "Tamanho Máximo: 50"
  triggeredMessage?: string; // Mensagem extraída do DOM
}

export interface FlowTransition {
  fromPage: string;
  toPage: string;
  actionTrigger: string;
}
