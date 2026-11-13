-- Who did what: each activity log entry records the staff member (null = the system: daily run, webhooks, sending).
alter table activity_log add column if not exists staff_id uuid;
alter table activity_log add column if not exists by_ text;
create index if not exists activity_log_staff on activity_log(staff_id, n desc) where staff_id is not null;
