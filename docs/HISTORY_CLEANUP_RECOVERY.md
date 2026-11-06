# History cleanup and recovery

Normal Reset to Zero and daily rollover retain history. Permanent history cleanup
is a separate desktop Event Setup operation, not part of a normal reset.

Before cleanup, save the required verified JSON backup to a private location.
It contains personal details and SE records. Do not commit or publish it.
Google Sheets is never cleared or changed by cleanup and is an independent raw
registration copy, not a complete queue/stock backup.

There is no automatic restore screen. If cleanup was unintended:

1. Stop operating the affected location. Keep the original backup unchanged.
   If new registrations occurred, preserve a separate current backup too.
2. Contact the developer with the backup request ID and affected location.
   Share the sensitive file only through an approved private channel.
3. The developer must verify the file format/version, instance identity and
   cleanup receipt before choosing full restoration or a selective merge.
4. Rehearse the scoped restore in an isolated database first. Restore parent
   runs/registrations before linked tickets, print/stock/claim records; reconcile
   foreign keys, replacement pointers and idempotency receipts. Do not overwrite
   another location or blindly import configuration over newer settings.
5. Retired-code reservations, new daily codes and fresh post-cleanup records need
   explicit reconciliation. Do not re-enable old printed SE slips accidentally.
6. Reconcile the desktop local queue/cache and TV projection with the restored
   authoritative run. Verify totals and stock before resuming operations.

The export includes cloud location records, local state and queue recovery data;
the cloud writer secret is excluded. Do not replace licensing, installation
identity or credentials during a record restore. Preserve newer live data and
do not replay Google Sheets outbox jobs blindly: original Sheets remain intact.
