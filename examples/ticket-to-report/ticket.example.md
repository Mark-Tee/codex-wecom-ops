# Example ticket

```text
Ticket: EXAMPLE-1042
Received: 2026-01-15 09:20
Location: EXAMPLE-SITE
Request: Replace a failed power module in rack A3.
Action: Isolated the module, replaced it, restored power, and verified alarms.
Completed: 2026-01-15 10:45
Operator: OPERATOR_A
```

Expected behavior:

- preserve the example ticket number and timestamps
- ask before adding a duration if the target table requires one
- produce a weekly row and a handover row in the configured schema
- create a local draft only unless a write is separately confirmed
