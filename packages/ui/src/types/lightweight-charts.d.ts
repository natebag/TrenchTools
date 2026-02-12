// Type declarations for lightweight-charts
// Suppresses TS errors for chart API methods

declare module 'lightweight-charts' {
  export interface IChartApi {
    addCandlestickSeries(options?: any): ISeriesApi<any>;
    remove(): void;
    applyOptions(options: any): void;
    timeScale(): any;
  }

  export interface ISeriesApi<T> {
    setData(data: any[]): void;
    setMarkers(markers: any[]): void;
    applyOptions(options: any): void;
  }

  export type UTCTimestamp = number;

  export function createChart(container: HTMLElement, options?: any): IChartApi;
}
