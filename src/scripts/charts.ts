/**
 * ECharts with only the parts the site uses, rendering to SVG, and the colours read from the page's CSS custom
 * properties so charts follow the light and dark themes.
 */
import { LineChart, type LineSeriesOption } from 'echarts/charts';
import {
  GridComponent,
  MarkLineComponent,
  TooltipComponent,
  type GridComponentOption,
  type MarkLineComponentOption,
  type TooltipComponentOption,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';

echarts.use([LineChart, GridComponent, TooltipComponent, MarkLineComponent, SVGRenderer]);

export type ChartOption = echarts.ComposeOption<
  LineSeriesOption | GridComponentOption | TooltipComponentOption | MarkLineComponentOption
>;

export { echarts };

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** The chrome colours of the current theme. */
export function chrome(): Record<'surface' | 'raised' | 'ink' | 'ink2' | 'muted' | 'grid' | 'axis' | 'border', string> {
  return {
    surface: cssVar('--surface'),
    raised: cssVar('--raised'),
    ink: cssVar('--ink'),
    ink2: cssVar('--ink-2'),
    muted: cssVar('--muted'),
    grid: cssVar('--grid'),
    axis: cssVar('--axis'),
    border: cssVar('--border'),
  };
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** For the few strings that go into ECharts' HTML tooltips. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
}

/** The data index under the pointer in an axis tooltip's params, which ECharts types loosely. */
export function tooltipIndex(params: unknown): number {
  const first = Array.isArray(params) ? params[0] : params;
  const index = (first as { dataIndex?: unknown } | undefined)?.dataIndex;

  return typeof index === 'number' ? index : -1;
}
