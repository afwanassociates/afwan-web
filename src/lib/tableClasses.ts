/**
 * Classes shared by the staff list tables (PassportTable, the step pages), so every list
 * looks the same: header row, header cells, body cells and the pinned actions column.
 */
export const TABLE_HEAD = 'border-b border-stroke text-xs tracking-wider text-muted uppercase'
export const TABLE_TH = 'py-3 pr-4 font-semibold whitespace-nowrap'
export const TABLE_TD = 'py-3 pr-4 text-slate-800'

/** Right-pinned actions column: white background and a soft edge over scrolled cells. */
export const STICKY_ACTIONS =
  'sticky right-0 z-10 bg-white pl-3 shadow-[-12px_0_12px_-12px_rgb(15_23_42/0.25)]'
