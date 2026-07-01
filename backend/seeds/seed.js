'use strict';

/**
 * Reference + test-account seed (Malate District, Manila).
 *
 * Inserts:
 *   - The 5 UAT partner barangays (726, 727, 729, 730, 762 — Malate, Zone 79)
 *     and prunes any other barangays the docker init seed.sql created
 *   - Each partner barangay's streets (see PARTNER_BARANGAYS) with map coordinates
 *   - The canonical 10 active parking rules per street (RA 4136 + MMDA 2023)
 *   - The 4 penalty tiers (Verbal Warning / Ticket ₱500 / Wheel Clamp ₱1,000 / Impound ₱2,000)
 *   - 5 test users, one per role + 1 deactivated account + one official per
 *     partner barangay (barangay726…762@test.com)
 *     — DEVELOPMENT ONLY, remove before production
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

// ── UAT partner barangays (Malate, Zone 79 / District V, Manila) ──────────────
// The five real partner barangays for UAT, and the streets that fall under each.
//
// Each barangay's CENTROID (lat/lng) is VERIFIED against OpenStreetMap and drives
// the barangay-level violation heat map (one density blob per barangay). We plot by
// barangay — not per-street — because Manila street names repeat across the city
// and exact barangay boundaries aren't published, which made per-street coordinates
// unreliable. All five centroids cluster east of Taft around Vito Cruz (Zone 79).
//
// Street lists are the barangay captains' confirmed streets (provided for UAT).
// A street name may appear under more than one barangay (e.g. Pablo Ocampo in 729
// and 762) — that's fine, each is a separate STREETS row per barangay.
const PARTNER_BARANGAYS = [
  { number: 726, lat: 14.5674, lng: 120.9952, streets: [
    { name: 'Cong A. Francisco Street' },
    { name: 'J.B. Roxas Street' },
    { name: 'Maligaya Street' },
    { name: 'Singalong Street' },
  ] },
  { number: 727, lat: 14.5659, lng: 120.9955, streets: [
    { name: 'Leon Guinto Street' },
    { name: 'Del Carmen Street' },
    { name: 'Captain Ticong Street' },
    { name: 'Dagonoy Street' },
    { name: 'Don Ysidro Street' },
  ] },
  { number: 729, lat: 14.5620, lng: 120.9960, streets: [
    { name: 'Sandejas Street' },
    { name: 'Pablo Ocampo Street' },
    { name: 'Daang Radayal Blg.2' },
  ] },
  { number: 730, lat: 14.5626, lng: 120.9975, streets: [
    { name: 'Tramo Street' },
    { name: 'Dominga Street' },
    { name: 'Villarel Street' },
  ] },
  { number: 762, lat: 14.5696, lng: 120.9942, streets: [
    { name: 'Arellano Street' },
    { name: 'Don Pedro Street' },
    { name: 'C.Ayala Street' },
    { name: 'Consuelo Street' },
    { name: 'Pablo Ocampo Street' },
    { name: 'Bautista Street' },
  ] },
];
const PARTNER_NUMBERS = PARTNER_BARANGAYS.map((b) => b.number);

// Active rules added for every street — the canonical 10 violation types
// (RA 4136 + MMDA MMTC 2023). Kept in sync with migration 019; the exact
// strings must match so re-running the seed never reintroduces old/duplicate
// names (e.g. "Blocking Driveway" vs "Blocking Driveway or Entrance").
const VIOLATION_TYPES = [
  'Parked on Sidewalk',
  'Parked on Pedestrian Lane',
  'Parked on Yellow Line',
  'Parked in No Parking Zone',
  'Double Parking',
  'Blocking Driveway or Entrance',
  'Wrong Side Parking',
  'Parked at Intersection or Corner',
  'Parked in Front of Fire Hydrant',
  'Parked in Bus or Jeepney Stop Zone',
];

// Matched against VEHICLES.total_violations when a report is verified.
// 4-tier escalating enforcement (migration 022). The offense number for a report
// = the vehicle's confirmed-violation count + 1, matched against min/max_violations.
//   1st — Verbal Warning (no fine)   2nd — Ticket (₱500)
//   3rd — Wheel Clamp (₱1,000)       4th+ — Impound (₱2,000)
const PENALTY_TIERS = [
  { tier_name: '1st Offense', enforcement_action: 'Verbal Warning', min_violations: 0, max_violations: 1,    fine_amount: 0.0,    requires_clamping: false, requires_impound: false },
  { tier_name: '2nd Offense', enforcement_action: 'Ticket',         min_violations: 2, max_violations: 2,    fine_amount: 500.0,  requires_clamping: false, requires_impound: false },
  { tier_name: '3rd Offense', enforcement_action: 'Wheel Clamp',    min_violations: 3, max_violations: 3,    fine_amount: 1000.0, requires_clamping: true,  requires_impound: false },
  { tier_name: '4th Offense', enforcement_action: 'Impound',        min_violations: 4, max_violations: null, fine_amount: 2000.0, requires_clamping: false, requires_impound: true  },
];

// ⚠ DEVELOPMENT ONLY — remove these accounts before any production deploy.
// barangay@test.com is assigned to Barangay 701 (barangay_id 1 on a fresh DB);
// the id is looked up by name so the seed also works on pre-existing databases.
const TEST_USERS = [
  { email: 'citizen@test.com',    role: 'citizen',         first_name: 'Test', last_name: 'Citizen',    barangay: null,           alias: 'Citizen_test01' },
  { email: 'barangay@test.com',   role: 'brgy_official',   first_name: 'Test', last_name: 'Official',   barangay: 'Barangay 726', alias: 'Official_test01' },
  { email: 'officer@test.com',    role: 'mtpb_officer',    first_name: 'Test', last_name: 'Officer',    barangay: null,           alias: 'Officer_test01' },
  { email: 'supervisor@test.com', role: 'mtpb_supervisor', first_name: 'Test', last_name: 'Supervisor', barangay: null,           alias: 'Supervisor_test01' },
  { email: 'admin@test.com',      role: 'admin',           first_name: 'Test', last_name: 'Admin',      barangay: null,           alias: 'Admin_test01' },
];

// ---------------------------------------------------------------------------
// Seeders
// ---------------------------------------------------------------------------

async function seedBarangays(connection) {
  // Create the partner barangays (participating in the pilot) with their centroid
  // coordinates for the barangay-level heat map.
  for (const { number, lat, lng } of PARTNER_BARANGAYS) {
    await connection.execute(
      `INSERT INTO BARANGAYS (barangay_name, barangay_number, is_participating, latitude, longitude)
       VALUES (?, ?, TRUE, ?, ?)
       ON DUPLICATE KEY UPDATE is_participating = TRUE, latitude = VALUES(latitude), longitude = VALUES(longitude)`,
      [`Barangay ${number}`, String(number), lat, lng]
    );
  }

  // Prune any NON-partner barangays (e.g. the old 701–720 test set that the docker
  // init seed.sql creates) and their streets + parking rules, so the citizen
  // street picker and staff queues only show the real partner barangays.
  // Safe on a fresh UAT DB (no reports yet). If a report already references a
  // non-partner street the FK blocks the delete rather than orphaning data —
  // always run this after `docker compose down -v` for UAT.
  const ph = PARTNER_NUMBERS.map(() => '?').join(', ');
  await connection.query(
    `DELETE pr FROM PARKING_RULES pr
       JOIN STREETS s   ON s.street_id   = pr.street_id
       JOIN BARANGAYS b ON b.barangay_id = s.barangay_id
      WHERE b.barangay_number NOT IN (${ph})`, PARTNER_NUMBERS);
  await connection.query(
    `DELETE s FROM STREETS s
       JOIN BARANGAYS b ON b.barangay_id = s.barangay_id
      WHERE b.barangay_number NOT IN (${ph})`, PARTNER_NUMBERS);
  await connection.query(
    `DELETE FROM BARANGAYS WHERE barangay_number NOT IN (${ph})`, PARTNER_NUMBERS);

  logger.info(`Barangays seeded (${PARTNER_BARANGAYS.length} partner barangays: ${PARTNER_NUMBERS.join(', ')}; non-partners pruned)`);
}

// Returns Map<barangay_name, barangay_id> for the seeded barangays.
async function getBarangayIds(connection) {
  const [rows] = await connection.query(
    "SELECT barangay_id, barangay_name FROM BARANGAYS WHERE barangay_name LIKE 'Barangay 7%'"
  );
  return new Map(rows.map((r) => [r.barangay_name, r.barangay_id]));
}

async function seedStreets(connection, barangayIds) {
  let streetCount = 0;
  for (const { number, streets } of PARTNER_BARANGAYS) {
    const barangayId = barangayIds.get(`Barangay ${number}`);
    if (!barangayId) continue;
    for (const st of streets) {
      // uq_street_per_barangay (barangay_id, street_name) makes this idempotent.
      // Street coordinates are no longer needed — the heat map plots by barangay
      // centroid (see BARANGAYS.latitude/longitude), not per street.
      await connection.execute(
        'INSERT IGNORE INTO STREETS (barangay_id, street_name, is_active) VALUES (?, ?, TRUE)',
        [barangayId, st.name]
      );
      streetCount++;
    }
  }
  logger.info(`Streets seeded (${streetCount} streets across ${PARTNER_BARANGAYS.length} partner barangays)`);
}

async function seedParkingRules(connection) {
  // Self-correcting: remove any rule whose violation_type isn't in the canonical
  // list (mirrors migration 019). The docker init seed.sql ships older/incon-
  // sistent names (e.g. "Blocking Driveway" vs "Blocking Driveway or Entrance"),
  // so without this a fresh boot ends up with 11 distinct types instead of 10.
  const placeholders = VIOLATION_TYPES.map(() => '?').join(', ');
  const [pruned] = await connection.query(
    `DELETE FROM PARKING_RULES WHERE violation_type NOT IN (${placeholders})`,
    VIOLATION_TYPES
  );
  if (pruned.affectedRows > 0) {
    logger.info(`Parking rules pruned (${pruned.affectedRows} non-canonical rows removed)`);
  }

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
  // Self-correcting: drop any tier whose name isn't in the canonical 4 (e.g. the
  // old '3rd Offense+' from the pre-4-tier structure) so re-runs converge cleanly.
  const names = PENALTY_TIERS.map((t) => t.tier_name);
  const placeholders = names.map(() => '?').join(', ');
  const [pruned] = await connection.query(
    `DELETE FROM PENALTY_TIERS WHERE tier_name NOT IN (${placeholders})`,
    names
  );
  if (pruned.affectedRows > 0) {
    logger.info(`Penalty tiers pruned (${pruned.affectedRows} non-canonical tiers removed)`);
  }

  for (const tier of PENALTY_TIERS) {
    // PENALTY_TIERS has no unique key on tier_name, so upsert manually.
    const [[existing]] = await connection.execute(
      'SELECT tier_id FROM PENALTY_TIERS WHERE tier_name = ? LIMIT 1',
      [tier.tier_name]
    );

    if (existing) {
      await connection.execute(
        `UPDATE PENALTY_TIERS
            SET enforcement_action = ?, min_violations = ?, max_violations = ?,
                fine_amount = ?, requires_clamping = ?, requires_impound = ?
          WHERE tier_id = ?`,
        [tier.enforcement_action, tier.min_violations, tier.max_violations,
         tier.fine_amount, tier.requires_clamping, tier.requires_impound, existing.tier_id]
      );
    } else {
      await connection.execute(
        `INSERT INTO PENALTY_TIERS
           (tier_name, enforcement_action, min_violations, max_violations,
            fine_amount, requires_clamping, requires_impound)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [tier.tier_name, tier.enforcement_action, tier.min_violations, tier.max_violations,
         tier.fine_amount, tier.requires_clamping, tier.requires_impound]
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
    // is_verified = FALSE: login does not gate on it (only is_active), and the
    // audit (Check 1.6) expects unverified test accounts.
    await connection.execute(
      `INSERT INTO USERS
         (first_name, last_name, email, password_hash, role, anonymous_alias,
          barangay_id, is_verified, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, FALSE, TRUE)
       ON DUPLICATE KEY UPDATE
         password_hash = VALUES(password_hash),
         role          = VALUES(role),
         barangay_id   = VALUES(barangay_id),
         is_verified   = FALSE,
         is_active     = TRUE`,
      [user.first_name, user.last_name, user.email, hash, user.role, user.alias, barangayId]
    );
  }
  logger.info(`Test users seeded (${TEST_USERS.length} rows, password: ${TEST_PASSWORD})`);
}

// Deactivated test account — drives TC-AUTH-03 (login must return 403 for a
// deactivated user). Separate from the active TEST_USERS because the ON
// DUPLICATE branch must force is_active = FALSE on every re-run.
async function seedDeactivatedUser(connection) {
  const hash = await bcrypt.hash(TEST_PASSWORD, SALT_ROUNDS);
  await connection.execute(
    `INSERT INTO USERS
       (first_name, last_name, email, password_hash, role, anonymous_alias,
        barangay_id, is_verified, is_active)
     VALUES (?, ?, ?, ?, ?, ?, NULL, FALSE, FALSE)
     ON DUPLICATE KEY UPDATE
       password_hash = VALUES(password_hash),
       role          = VALUES(role),
       is_verified   = FALSE,
       is_active     = FALSE`,
    ['Deactivated', 'TestUser', 'deactivated@test.com', hash, 'citizen', 'Reporter #0000']
  );
  logger.info('Deactivated test account seeded (deactivated@test.com, is_active = FALSE)');
}

// One barangay official PER partner barangay, so a citizen report on any partner
// street has an official who can verify it (FR-12 scopes each official to their
// own barangay). Emails are barangay726@test.com … barangay762@test.com, all
// password Test1234!. barangay@test.com (in TEST_USERS) is the alias for Barangay 726.
async function seedBarangayOfficials(connection, barangayIds) {
  const hash = await bcrypt.hash(TEST_PASSWORD, SALT_ROUNDS);
  let count = 0;
  for (const { number } of PARTNER_BARANGAYS) {
    const barangayId = barangayIds.get(`Barangay ${number}`);
    if (!barangayId) continue; // barangay not seeded — skip rather than orphan
    await connection.execute(
      `INSERT INTO USERS
         (first_name, last_name, email, password_hash, role, anonymous_alias,
          barangay_id, is_verified, is_active)
       VALUES (?, ?, ?, ?, 'brgy_official', ?, ?, FALSE, TRUE)
       ON DUPLICATE KEY UPDATE
         password_hash = VALUES(password_hash),
         role          = VALUES(role),
         barangay_id   = VALUES(barangay_id),
         is_verified   = FALSE,
         is_active     = TRUE`,
      [`Brgy ${number}`, 'Official', `barangay${number}@test.com`, hash, `Official_brgy${number}`, barangayId]
    );
    count++;
  }
  logger.info(`Barangay officials seeded (${count} rows: barangay${PARTNER_NUMBERS[0]}@test.com … barangay${PARTNER_NUMBERS[PARTNER_NUMBERS.length - 1]}@test.com)`);
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
    await seedDeactivatedUser(connection);
    await seedBarangayOfficials(connection, barangayIds);

    logger.info('─────────────────────────────────────────');
    logger.info(`Seed complete. Test accounts use password: ${TEST_PASSWORD}`);
    logger.info('  citizen@test.com                → citizen');
    logger.info('  barangay@test.com               → brgy_official (Barangay 726)');
    logger.info(`  barangay{${PARTNER_NUMBERS.join('/')}}@test.com → brgy_official (one per partner barangay)`);
    logger.info('  officer@test.com                → mtpb_officer');
    logger.info('  supervisor@test.com             → mtpb_supervisor');
    logger.info('  admin@test.com                  → admin');
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
