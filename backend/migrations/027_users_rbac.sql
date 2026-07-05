-- Migration 027: add group_id and supervisor_id to USERS
-- group_id: the RBAC group this user belongs to (maps role -> permissions)
-- supervisor_id: for mtpb_officer rows, the supervisor they report to;
--   used to scope MTPB Supervisor read access to only their own officers.

ALTER TABLE USERS
  ADD COLUMN group_id      INT NULL AFTER role,
  ADD COLUMN supervisor_id INT NULL AFTER group_id;

ALTER TABLE USERS
  ADD CONSTRAINT fk_users_group
    FOREIGN KEY (group_id) REFERENCES user_groups(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_users_supervisor
    FOREIGN KEY (supervisor_id) REFERENCES USERS(user_id) ON DELETE SET NULL;

CREATE INDEX idx_users_group      ON USERS (group_id);
CREATE INDEX idx_users_supervisor ON USERS (supervisor_id);
