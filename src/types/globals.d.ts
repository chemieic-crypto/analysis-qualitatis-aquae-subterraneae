import type * as LeafletNS from "leaflet";
import type Highcharts from "highcharts";

declare global {
  interface Window {
    L?: typeof LeafletNS;
    Highcharts?: typeof Highcharts;
    _Highcharts?: typeof Highcharts;
  }

  interface HTMLDivElement {
    _leaflet_id?: number;
    _leaflet_map?: LeafletNS.Map;
  }

  interface HTMLElement {
    _leaflet_id?: number;
    _leaflet_map?: LeafletNS.Map;
  }

  interface CSSStyleDeclaration {
    webkitBackdropFilter?: string;
  }
}

declare module "exceljs" {
  interface Worksheet {
    _customFormatted?: boolean;
  }
}

export {};
