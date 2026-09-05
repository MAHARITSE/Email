declare module 'mammoth' {
  export interface MammothResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }
  export function convertToHtml(
    input: { arrayBuffer: ArrayBuffer } | { buffer: any },
    options?: any
  ): Promise<MammothResult>;
  export function extractRawText(
    input: { arrayBuffer: ArrayBuffer } | { buffer: any },
    options?: any
  ): Promise<MammothResult>;
  const mammoth: {
    convertToHtml: typeof convertToHtml;
    extractRawText: typeof extractRawText;
  };
  export default mammoth;
}
