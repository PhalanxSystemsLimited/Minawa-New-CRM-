-- Building managers report to an accountant (25 Nov 2026), set by the Admin on Staff & connections. The accountant sees
-- his managers' buildings, approves their payments one by one and does the desk work (bills, reminders, notices).
-- New column only. Safe to run again.
alter table staff add column if not exists reports_to text;
