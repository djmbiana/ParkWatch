'use strict';

/**
 * Development seed script — creates test users, vehicles, and sample reports.
 *
 * Prerequisites:
 *   1. docker-compose up (or a running MySQL instance)
 *   2. schema.sql and seed.sql have already been applied
 *
 * Run (from the backend/ directory):
 *   npm run seed                        ← locally with ./backend/.env loaded
 *   docker-compose exec backend npm run seed   ← inside the running container
 *
 * All seed accounts use the password:  Malate@2025
 * Safe to re-run — INSERT IGNORE skips rows that already exist (by unique key).
 */

require('dotenv').config();

const bcrypt = require('bcrypt');
const { pool } = require('./db');
const logger   = require('./logger');

const SALT_ROUNDS  = 10;
const DEV_PASSWORD = 'Malate@2025';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function insertIgnore(connection, sql, params = []) {
  const [result] = await connection.execute(sql, params);
  return result;
}

// ---------------------------------------------------------------------------
// Lookup reference IDs (avoids hardcoding AUTO_INCREMENT values)
// ---------------------------------------------------------------------------

async function getReferenceIds(connection) {
  const [[brgy688]]  = await connection.execute("SELECT barangay_id FROM BARANGAYS WHERE barangay_name = 'Barangay 688'");
  const [[brgy695]]  = await connection.execute("SELECT barangay_id FROM BARANGAYS WHERE barangay_name = 'Barangay 695'");
  const [[brgy700]]  = await connection.execute("SELECT barangay_id FROM BARANGAYS WHERE barangay_name = 'Barangay 700'");

  const [[adriatico]] = await connection.execute("SELECT street_id FROM STREETS WHERE street_name = 'Adriatico Street'");
  const [[delPilar]]  = await connection.execute("SELECT street_id FROM STREETS WHERE street_name = 'M.H. del Pilar Street'");
  const [[taft]]      = await connection.execute("SELECT street_id FROM STREETS WHERE street_name = 'Taft Avenue'");

  const [[tier1]] = await connection.execute("SELECT tier_id FROM PENALTY_TIERS WHERE tier_name = '1st Offense'");
  const [[tier2]] = await connection.execute("SELECT tier_id FROM PENALTY_TIERS WHERE tier_name = '2nd Offense'");
  const [[tier3]] = await connection.execute("SELECT tier_id FROM PENALTY_TIERS WHERE tier_name = '3rd Offense+'");

  if (!brgy688 || !adriatico || !tier1) {
    throw new Error('Reference data not found. Run seed.sql first (docker-compose up should handle this).');
  }

  return {
    barangay: { b688: brgy688.barangay_id, b695: brgy695.barangay_id, b700: brgy700.barangay_id },
    street:   { adriatico: adriatico.street_id, delPilar: delPilar.street_id, taft: taft.street_id },
    tier:     { first: tier1.tier_id, second: tier2.tier_id, third: tier3.tier_id },
  };
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

async function seedUsers(connection, hash, refs) {
  const { barangay: b } = refs;

  const users = [
    // role,              first_name,  last_name,    email,                          barangay_id, is_verified
    ['admin',             'System',    'Admin',      'admin@parkwatch.ph',            null,        true],
    ['mtpb_supervisor',   'Juan',      'Dela Cruz',  'supervisor@mtpb.gov.ph',        null,        true],
    ['mtpb_officer',      'Pedro',     'Reyes',      'officer1@mtpb.gov.ph',          b.b688,      true],
    ['mtpb_officer',      'Carlos',    'Garcia',     'officer2@mtpb.gov.ph',          b.b695,      true],
    ['brgy_official',     'Mario',     'Bautista',   'official1@brgy688.gov.ph',      b.b688,      true],
    ['brgy_official',     'Jose',      'Ramos',      'official2@brgy695.gov.ph',      b.b695,      true],
    ['citizen',           'Ana',       'Santos',     'citizen1@gmail.com',            null,        false],
    ['citizen',           'Maria',     'Cruz',       'citizen2@gmail.com',            null,        false],
    ['citizen',           'Roberto',   'Lim',        'citizen3@gmail.com',            null,        false],
  ];

  for (const [role, firstName, lastName, email, barangayId, isVerified] of users) {
    await insertIgnore(connection,
      `INSERT IGNORE INTO USERS
         (first_name, last_name, email, password_hash, role, barangay_id, is_verified, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [firstName, lastName, email, hash, role, barangayId, isVerified]
    );
  }

  logger.info(`Users seeded (${users.length} rows, skips duplicates)`);
}

// ---------------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------------

async function seedVehicles(connection) {
  const vehicles = [
    // plate,       type,          color,   total_violations, is_repeat_offender
    ['ABC-1234',   'car',         'Black',  3,                true],   // known repeat offender
    ['XYZ-5678',   'motorcycle',  'Red',    1,                false],
    ['PQR-9012',   'jeepney',     'Blue',   0,                false],
  ];

  for (const [plate, type, color, totalViolations, isRepeat] of vehicles) {
    await insertIgnore(connection,
      `INSERT IGNORE INTO VEHICLES
         (plate_number, vehicle_type, color, total_violations, is_repeat_offender, first_recorded_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [plate, type, color, totalViolations, isRepeat]
    );
  }

  logger.info(`Vehicles seeded (${vehicles.length} rows, skips duplicates)`);
}

// ---------------------------------------------------------------------------
// Sample Violation Reports
// ---------------------------------------------------------------------------

async function seedReports(connection, refs) {
  const { street: s, barangay: b, tier } = refs;

  // Look up user IDs by email
  const [[citizen1]] = await connection.execute("SELECT user_id FROM USERS WHERE email = 'citizen1@gmail.com'");
  const [[citizen2]] = await connection.execute("SELECT user_id FROM USERS WHERE email = 'citizen2@gmail.com'");
  const [[officer1]] = await connection.execute("SELECT user_id FROM USERS WHERE email = 'officer1@mtpb.gov.ph'");
  const [[supervisor]] = await connection.execute("SELECT user_id FROM USERS WHERE email = 'supervisor@mtpb.gov.ph'");

  // Look up vehicle IDs
  const [[vAbc]] = await connection.execute("SELECT vehicle_id FROM VEHICLES WHERE plate_number = 'ABC-1234'");
  const [[vXyz]] = await connection.execute("SELECT vehicle_id FROM VEHICLES WHERE plate_number = 'XYZ-5678'");

  const reports = [
    {
      // 1 — freshly submitted, OCR picked up the plate, awaiting verification
      citizen_id:           citizen1.user_id,
      vehicle_id:           null,
      street_id:            s.adriatico,
      barangay_id:          b.b688,
      violation_type:       'No Parking Zone',
      photo_path:           'reports/dev-sample-001.jpg',
      ocr_extracted_plate:  'ABC-1234',
      ocr_confidence_score: 92.50,
      manual_plate_input:   null,
      penalty_tier_id:      null,
      status:               'pending',
      submitted_at:         new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hrs ago
    },
    {
      // 2 — OCR was below threshold, citizen typed the plate manually; verified by officer
      citizen_id:           citizen2.user_id,
      vehicle_id:           vXyz.vehicle_id,
      street_id:            s.delPilar,
      barangay_id:          b.b695,
      violation_type:       'Double Parking',
      photo_path:           'reports/dev-sample-002.jpg',
      ocr_extracted_plate:  'XYZ567B',                 // OCR misread
      ocr_confidence_score: 61.20,                     // below OCR_CONFIDENCE_THRESHOLD
      manual_plate_input:   'XYZ-5678',                // citizen corrected it
      penalty_tier_id:      tier.first,
      status:               'verified',
      verified_by:          officer1.user_id,
      verified_at:          new Date(Date.now() - 1 * 60 * 60 * 1000),
      submitted_at:         new Date(Date.now() - 3 * 60 * 60 * 1000),
    },
    {
      // 3 — repeat offender, fully resolved with a ticket; clamping applied
      citizen_id:           citizen1.user_id,
      vehicle_id:           vAbc.vehicle_id,
      street_id:            s.taft,
      barangay_id:          b.b700,
      violation_type:       'Parking on Sidewalk',
      photo_path:           'reports/dev-sample-003.jpg',
      ocr_extracted_plate:  'ABC-1234',
      ocr_confidence_score: 97.80,
      manual_plate_input:   null,
      penalty_tier_id:      tier.third,
      status:               'resolved',
      assigned_officer_id:  officer1.user_id,
      verified_by:          supervisor.user_id,
      is_escalated:         true,
      ticket_reference:     'TKT-2025-0001',
      resolution_outcome:   'Vehicle clamped. Owner served with notice of violation.',
      submitted_at:         new Date(Date.now() - 24 * 60 * 60 * 1000),
      verified_at:          new Date(Date.now() - 23 * 60 * 60 * 1000),
      acknowledged_at:      new Date(Date.now() - 22 * 60 * 60 * 1000),
      dispatched_at:        new Date(Date.now() - 21 * 60 * 60 * 1000),
      resolved_at:          new Date(Date.now() - 20 * 60 * 60 * 1000),
    },
  ];

  for (const r of reports) {
    await insertIgnore(connection,
      `INSERT IGNORE INTO VIOLATION_REPORTS
         (citizen_id, vehicle_id, street_id, barangay_id, violation_type, photo_path,
          ocr_extracted_plate, ocr_confidence_score, manual_plate_input,
          penalty_tier_id, status, resolution_outcome, rejection_reason,
          verified_by, assigned_officer_id, is_escalated, ticket_reference,
          submitted_at, verified_at, acknowledged_at, dispatched_at, escalated_at, resolved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        r.citizen_id          ?? null,
        r.vehicle_id          ?? null,
        r.street_id           ?? null,
        r.barangay_id         ?? null,
        r.violation_type      ?? null,
        r.photo_path          ?? null,
        r.ocr_extracted_plate ?? null,
        r.ocr_confidence_score ?? null,
        r.manual_plate_input  ?? null,
        r.penalty_tier_id     ?? null,
        r.status,
        r.resolution_outcome  ?? null,
        r.rejection_reason    ?? null,
        r.verified_by         ?? null,
        r.assigned_officer_id ?? null,
        r.is_escalated        ?? false,
        r.ticket_reference    ?? null,
        r.submitted_at,
        r.verified_at         ?? null,
        r.acknowledged_at     ?? null,
        r.dispatched_at       ?? null,
        r.escalated_at        ?? null,
        r.resolved_at         ?? null,
      ]
    );
  }

  logger.info(`Reports seeded (${reports.length} rows, skips duplicates)`);
}

// ---------------------------------------------------------------------------
// Sample Notifications
// ---------------------------------------------------------------------------

async function seedNotifications(connection) {
  // Fetch the IDs we need
  const [[citizen1]] = await connection.execute("SELECT user_id FROM USERS WHERE email = 'citizen1@gmail.com'");
  const [[citizen2]] = await connection.execute("SELECT user_id FROM USERS WHERE email = 'citizen2@gmail.com'");
  const [[report2]]  = await connection.execute(
    "SELECT report_id FROM VIOLATION_REPORTS WHERE status = 'verified' LIMIT 1"
  );
  const [[report3]]  = await connection.execute(
    "SELECT report_id FROM VIOLATION_REPORTS WHERE status = 'resolved' LIMIT 1"
  );

  if (!report2 || !report3) return; // nothing to link to

  const notifications = [
    [report2.report_id, citizen2.user_id, 'Your report has been verified and forwarded to MTPB.', 'status_update', new Date(), false, null],
    [report3.report_id, citizen1.user_id, 'Your report has been resolved. Ticket issued: TKT-2025-0001.',  'resolution',   new Date(), true, new Date()],
  ];

  for (const [reportId, recipientId, message, type, sentAt, isRead, readAt] of notifications) {
    await insertIgnore(connection,
      `INSERT INTO NOTIFICATION_LOG
         (report_id, recipient_id, message, notification_type, sent_at, is_read, read_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [reportId, recipientId, message, type, sentAt, isRead, readAt]
    );
  }

  logger.info(`Notifications seeded (${notifications.length} rows)`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function seed() {
  logger.info('Starting dev seed...');
  const connection = await pool.getConnection();

  try {
    const hash = await bcrypt.hash(DEV_PASSWORD, SALT_ROUNDS);
    logger.info(`Password hash computed for "${DEV_PASSWORD}"`);

    const refs = await getReferenceIds(connection);

    await seedUsers(connection, hash, refs);
    await seedVehicles(connection);
    await seedReports(connection, refs);
    await seedNotifications(connection);

    logger.info('─────────────────────────────────────────');
    logger.info('Dev seed complete. All accounts use password: Malate@2025');
    logger.info('  admin@parkwatch.ph         → admin');
    logger.info('  supervisor@mtpb.gov.ph     → mtpb_supervisor');
    logger.info('  officer1@mtpb.gov.ph       → mtpb_officer (Barangay 688)');
    logger.info('  officer2@mtpb.gov.ph       → mtpb_officer (Barangay 695)');
    logger.info('  official1@brgy688.gov.ph   → brgy_official');
    logger.info('  official2@brgy695.gov.ph   → brgy_official');
    logger.info('  citizen1@gmail.com         → citizen');
    logger.info('  citizen2@gmail.com         → citizen');
    logger.info('  citizen3@gmail.com         → citizen');
    logger.info('─────────────────────────────────────────');
  } catch (err) {
    logger.error(`Seed failed: ${err.message}`);
    process.exit(1);
  } finally {
    connection.release();
    await pool.end();
  }
}

seed();
