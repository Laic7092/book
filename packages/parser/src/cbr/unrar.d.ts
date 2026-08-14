declare module "unrar-js/lib/Unrar.js" {
  export default function unrar(
    data: ArrayBuffer,
  ): Array<{ filename: string; fileData: Uint8Array }>;
}
