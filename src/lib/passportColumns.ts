/** Columns PassportTable can show (besides the passport name and number). */
export type PassportColumn =
  | 'reference'
  | 'country'
  | 'company'
  | 'received'
  | 'waiting'
  | 'medical'
  | 'medical_status'
  | 'slip_date'
  | 'medical_date'
  | 'valid_until'
  | 'days_left'
  | 'remarks'
  | 'entered_by'
  | 'stage'
  | 'passport_entered'

export const COLUMN_LABELS: Record<PassportColumn, string> = {
  reference: 'Reference',
  country: 'Country',
  company: 'Company',
  received: 'Received',
  waiting: 'Waiting',
  medical: 'Medical',
  medical_status: 'Medical',
  slip_date: 'Medical slip date',
  medical_date: 'Medical date',
  valid_until: 'Valid until',
  days_left: 'Days left',
  remarks: 'Remarks',
  entered_by: 'Entered by',
  stage: 'Stage',
  passport_entered: 'Stage',
}
