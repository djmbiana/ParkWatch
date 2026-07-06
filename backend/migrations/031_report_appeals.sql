-- mig031: Appeal process for declined reports.
-- Flow: rejected → contested (citizen files appeal) → upheld (stays rejected)
--                                                    → overturned (back to pending)
-- One appeal allowed per report.

ALTER TABLE VIOLATION_REPORTS
  MODIFY COLUMN status
    ENUM('pending','verified','acknowledged','dispatched','resolved','rejected','escalated','contested')
    NOT NULL DEFAULT 'pending';

CREATE TABLE IF NOT EXISTS REPORT_APPEALS (
  appeal_id     INT AUTO_INCREMENT PRIMARY KEY,
  report_id     INT NOT NULL,
  reason        TEXT NOT NULL,
  status        ENUM('pending','upheld','overturned') NOT NULL DEFAULT 'pending',
  verdict_notes TEXT,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at   TIMESTAMP NULL,
  FOREIGN KEY (report_id) REFERENCES VIOLATION_REPORTS(report_id) ON DELETE CASCADE
);
