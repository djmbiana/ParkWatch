'use strict';

/**
 * Reference + test-account seed (Malate District, Manila).
 *
 * Inserts:
 *   - Barangays 701–720 (all is_participating = TRUE)
 *   - 20 real Malate streets, assigned evenly across Barangays 701–710
 *   - 7 active parking rules per street
 *   - The 3 penalty tiers (₱900 / ₱1,800 / ₱3,600)
 *   - 5 test users, one per role — DEVELOPMENT ONLY, remove before production
 *
 * Run (from the backend/ directory):
 *   npm run seed                              ← locally with ./backend/.env loaded
 *   docker-compose exec backend npm run seed  ← inside the running container
 *
 * Safe to re-run: every section either upserts or checks for existing rows.
 * Penalty tiers are upserted by tier_name, so stale fine amounts from older
 * seeds are corrected in place.
 */

require('dotenv').config();

const bcrypt = require('bcrypt');
const { pool } = require('../src/config/db');
const logger = require('../src/config/logger');

const SALT_ROUNDS = 10;
const TEST_PASSWORD = 'Test1234!';

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

// Malate District barangays 701–720, all participating in the pilot.
const BARANGAY_NUMBERS = Array.from({ length: 20 }, (_, i) => 701 + i);

// Real Malate streets — assigned evenly (2 each, in order) across 701–710.
const STREET_NAMES = [
  'Adriatico Street',
  'Remedios Street',
  'M.H. Del Pilar Street',
  'Mabini Street',
  'J. Bocobo Street',
  'Nakpil Street',
  'Orosa Street',
  'Julio Nakpil Street',
  'Leveriza Street',
  'Pablo Ocampo Street',
  'Pedro Gil Street',
  'Taft Avenue',
  'Vito Cruz Street',
  'UN Avenue',
  'Kalaw Avenue',
  'Roxas Boulevard (service road)',
  'Agno Street',
  'Dominga Street',
  'Singalong Street',
  'General Luna Street',
];
const STREETS_PER_BARANGAY = STREET_NAMES.length / 10; // 2 per barangay, 701–710

// Active rules added for every street.
const VIOLATION_TYPES = [
  'Wrong Side Parking',
  'Parked on Sidewalk',
  'Parked on Pedestrian Lane',
  'Parked on Yellow Line',
  'Double Parking',
  'Parked in No Parking Zone',
  'Blocking Driveway',
];

// Matched against VEHICLES.total_violations when a report is verified.
const PENALTY_TIERS = [
  { tier_name: '1st Offense',  min_violations: 0, max_violations: 1,    fine_amount: 900.0,  requires_clamping: false },
  { tier_name: '2nd Offense',  min_violations: 2, max_violations: 2,    fine_amount: 1800.0, requires_clamping: false },
  { tier_name: '3rd Offense+', min_violations: 3, max_violations: null, fine_amount: 3600.0, requires_clamping: true  },
];

// ⚠ DEVELOPMENT ONLY — remove these accounts before any production deploy.
// barangay@test.com is assigned to Barangay 701 (barangay_id 1 on a fresh DB);
// the id is looked up by name so the seed also works on pre-existing databases.
const TEST_USERS = [
  { email: 'citizen@test.com',    role: 'citizen',         first_name: 'Test', last_name: 'Citizen',    barangay: null,           alias: 'Citizen_test01' },
  { email: 'barangay@test.com',   role: 'brgy_official',   first_name: 'Test', last_name: 'Official',   barangay: 'Barangay 701', alias: 'Official_test01' },
  { email: 'officer@test.com',    role: 'mtpb_officer',    first_name: 'Test', last_name: 'Officer',    barangay: null,           alias: 'Officer_test01' },
  { email: 'supervisor@test.com', role: 'mtpb_supervisor', first_name: 'Test', last_name: 'Supervisor', barangay: null,           alias: 'Supervisor_test01' },
  { email: 'admin@test.com',      role: 'admin',           first_name: 'Test', last_name: 'Admin',      barangay: null,           alias: 'Admin_test01' },
];

// ---------------------------------------------------------------------------
// Seeders
// ---------------------------------------------------------------------------

async function seedBarangays(connection) {
  for (const number of BARANGAY_NUMBERS) {
    // Upsert so barangays seeded earlier with is_participating = FALSE
    // are flipped to participating, per the pilot scope.
    await connection.execute(
      `INSERT INTO BARANGAYS (barangay_name, barangay_number, is_participating)
       VALUES (?, ?, TRUE)
       ON DUPLICATE KEY UPDATE is_participating = TRUE`,
      [`Barangay ${number}`, String(number)]
    );
  }
  logger.info(`Barangays seeded (${BARANGAY_NUMBERS.length} rows, 701–720)`);
}

// Returns Map<barangay_name, barangay_id> for the seeded barangays.
async function getBarangayIds(connection) {
  const [rows] = await connection.query(
    "SELECT barangay_id, barangay_name FROM BARANGAYS WHERE barangay_name LIKE 'Barangay 7%'"
  );
  return new Map(rows.map((r) => [r.barangay_name, r.barangay_id]));
}

async function seedStreets(connection, barangayIds) {
  for (let i = 0; i < STREET_NAMES.length; i++) {
    const barangayName = `Barangay ${701 + Math.floor(i / STREETS_PER_BARANGAY)}`;
    const barangayId = barangayIds.get(barangayName);
    // uq_street_per_barangay (barangay_id, street_name) makes this idempotent.
    await connection.execute(
      'INSERT IGNORE INTO STREETS (barangay_id, street_name, is_active) VALUES (?, ?, TRUE)',
      [barangayId, STREET_NAMES[i]]
    );
  }
  logger.info(`Streets seeded (${STREET_NAMES.length} rows across Barangays 701–710)`);
}

async function seedParkingRules(connection) {
  // Set-based insert: every street × every violation type, skipping pairs
  // that already exist (PARKING_RULES has no unique key, so INSERT IGNORE
  // alone would duplicate rows on re-runs).
  const typeUnion = VIOLATION_TYPES.map(() => 'SELECT ? AS violation_type').join(' UNION ALL ');
  const [result] = await connection.query(
    `INSERT INTO PARKING_RULES (street_id, violation_type, is_active)
     SELECT s.street_id, v.violation_type, TRUE
       FROM STREETS s
      CROSS JOIN (${typeUnion}) v
      WHERE NOT EXISTS (
        SELECT 1 FROM PARKING_RULES p
         WHERE p.street_id = s.street_id AND p.violation_type = v.violation_type
      )`,
    VIOLATION_TYPES
  );
  logger.info(`Parking rules seeded (${result.affectedRows} inserted, ${VIOLATION_TYPES.length} types per street)`);
}

async function seedPenaltyTiers(connection) {
  for (const tier of PENALTY_TIERS) {
    // PENALTY_TIERS has no unique key on tier_name, so upsert manually.
    const [[existing]] = await connection.execute(
      'SELECT tier_id FROM PENALTY_TIERS WHERE tier_name = ? LIMIT 1',
      [tier.tier_name]
    );

    if (existing) {
      await connection.execute(
        `UPDATE PENALTY_TIERS
            SET min_violations = ?, max_violations = ?, fine_amount = ?, requires_clamping = ?
          WHERE tier_id = ?`,
        [tier.min_violations, tier.max_violations, tier.fine_amount, tier.requires_clamping, existing.tier_id]
      );
    } else {
      await connection.execute(
        `INSERT INTO PENALTY_TIERS
           (tier_name, min_violations, max_violations, fine_amount, requires_clamping)
         VALUES (?, ?, ?, ?, ?)`,
        [tier.tier_name, tier.min_violations, tier.max_violations, tier.fine_amount, tier.requires_clamping]
      );
    }
  }
  logger.info(`Penalty tiers seeded (${PENALTY_TIERS.length} tiers, upserted by tier_name)`);
}

async function seedTestUsers(connection, barangayIds) {
  const hash = await bcrypt.hash(TEST_PASSWORD, SALT_ROUNDS);

  for (const user of TEST_USERS) {
    const barangayId = user.barangay ? barangayIds.get(user.barangay) ?? null : null;
    // Upsert by uq_users_email so re-runs reset the password/role to the
    // documented test credentials even if the row was changed manually.
    await connection.execute(
      `INSERT INTO USERS
         (first_name, last_name, email, password_hash, role, anonymous_alias,
          barangay_id, is_verified, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, TRUE)
       ON DUPLICATE KEY UPDATE
         password_hash = VALUES(password_hash),
         role          = VALUES(role),
         barangay_id   = VALUES(barangay_id),
         is_verified   = TRUE,
         is_active     = TRUE`,
      [user.first_name, user.last_name, user.email, hash, user.role, user.alias, barangayId]
    );
  }
  logger.info(`Test users seeded (${TEST_USERS.length} rows, password: ${TEST_PASSWORD})`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function seed() {
  logger.info('Starting seed...');
  const connection = await pool.getConnection();

  try {
    await seedBarangays(connection);
    const barangayIds = await getBarangayIds(connection);
    await seedStreets(connection, barangayIds);
    await seedParkingRules(connection);
    await seedPenaltyTiers(connection);
    await seedTestUsers(connection, barangayIds);

    logger.info('─────────────────────────────────────────');
    logger.info(`Seed complete. Test accounts use password: ${TEST_PASSWORD}`);
    logger.info('  citizen@test.com      → citizen');
    logger.info('  barangay@test.com     → brgy_official (Barangay 701)');
    logger.info('  officer@test.com      → mtpb_officer');
    logger.info('  supervisor@test.com   → mtpb_supervisor');
    logger.info('  admin@test.com        → admin');
    logger.info('⚠ Test accounts are for development only — remove before production.');
    logger.info('─────────────────────────────────────────');
  } catch (err) {
    logger.error(`Seed failed: ${err.message}`);
    process.exitCode = 1;
  } finally {
    connection.release();
    await pool.end();
  }
}

seed();
