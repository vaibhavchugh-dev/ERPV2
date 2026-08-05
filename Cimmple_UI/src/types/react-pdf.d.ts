/**
 * Ambient typings for react-pdf under CRA's classic moduleResolution.
 * Package ships ESM .d.ts with .js extensions that TS "node" resolution cannot follow.
 */
declare module "react-pdf" {
  import type { ComponentType } from "react";

  export const pdfjs: {
    version: string;
    GlobalWorkerOptions: { workerSrc: string };
  };

  export const Document: ComponentType<any>;
  export const Page: ComponentType<any>;
  export const Outline: ComponentType<any>;
  export const Thumbnail: ComponentType<any>;
}

declare module "react-pdf/dist/Page/AnnotationLayer.css";
declare module "react-pdf/dist/Page/TextLayer.css";
