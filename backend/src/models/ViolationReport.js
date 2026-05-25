/**
 * ViolationReport model — maps to the VIOLATION_REPORTS table.
 * Core entity: tracks the full lifecycle from citizen submission
 * through OCR processing, verification, dispatch, and resolution.
 * Data-access logic added in a later sprint.
 * See src/config/schema.sql for the full table definition.
 */
const TABLE = 'VIOLATION_REPORTS';

const COLUMNS = {
  ID:                   'report_id',
  CITIZEN_ID:           'citizen_id',
  VEHICLE_ID:           'vehicle_id',
  STREET_ID:            'street_id',
  BARANGAY_ID:          'barangay_id',
  VIOLATION_TYPE:       'violation_type',
  PHOTO_PATH:           'photo_path',
  OCR_RAW_RESPONSE:     'ocr_raw_response',
  OCR_EXTRACTED_PLATE:  'ocr_extracted_plate',
  OCR_CONFIDENCE_SCORE: 'ocr_confidence_score',
  MANUAL_PLATE_INPUT:   'manual_plate_input',
  PENALTY_TIER_ID:      'penalty_tier_id',
  STATUS:               'status',
  RESOLUTION_OUTCOME:   'resolution_outcome',
  REJECTION_REASON:     'rejection_reason',
  VERIFIED_BY:          'verified_by',
  ASSIGNED_OFFICER_ID:  'assigned_officer_id',
  IS_ESCALATED:         'is_escalated',
  TICKET_REFERENCE:     'ticket_reference',
  SUBMITTED_AT:         'submitted_at',
  VERIFIED_AT:          'verified_at',
  ACKNOWLEDGED_AT:      'acknowledged_at',
  DISPATCHED_AT:        'dispatched_at',
  ESCALATED_AT:         'escalated_at',
  RESOLVED_AT:          'resolved_at',
  CREATED_AT:           'created_at',
  UPDATED_AT:           'updated_at',
};

/** Valid values for the `status` ENUM — mirrors schema.sql. */
const STATUSES = {
  PENDING:      'pending',
  VERIFIED:     'verified',
  ACKNOWLEDGED: 'acknowledged',
  DISPATCHED:   'dispatched',
  RESOLVED:     'resolved',
  REJECTED:     'rejected',
};

module.exports = { TABLE, COLUMNS, STATUSES };
