--------------------------- MODULE CliExecution ---------------------------
EXTENDS Naturals
CONSTANT Mutant
VARIABLES phase, dryRun, transport, sent, remote, output
vars == <<phase, dryRun, transport, sent, remote, output>>
Init == /\ phase = "start" /\ dryRun \in BOOLEAN /\ transport \in {"dashboard", "backend"}
        /\ sent = 0 /\ remote = "none" /\ output = "none"
ResolveContext == /\ phase = "start" /\ phase' = "validate"
                  /\ UNCHANGED <<dryRun, transport, sent, remote, output>>
RejectInput == /\ phase = "validate" /\ phase' = "failed" /\ output' = "error"
               /\ UNCHANGED <<dryRun, transport, sent, remote>>
Validate == /\ phase = "validate" /\ phase' = IF dryRun /\ ~Mutant THEN "dry" ELSE "permission"
            /\ UNCHANGED <<dryRun, transport, sent, remote, output>>
DrySummary == /\ phase = "dry" /\ phase' = "done" /\ output' = "dry-run"
              /\ UNCHANGED <<dryRun, transport, sent, remote>>
PermissionAllowed == /\ phase = "permission" /\ phase' = "send"
                     /\ UNCHANGED <<dryRun, transport, sent, remote, output>>
PermissionDenied == /\ phase = "permission" /\ phase' = "failed" /\ output' = "error"
                    /\ UNCHANGED <<dryRun, transport, sent, remote>>
SendTool == /\ phase = "send" /\ phase' = "inflight" /\ sent' = sent + 1
            /\ UNCHANGED <<dryRun, transport, remote, output>>
ToolReply == /\ phase = "inflight" /\ phase' = "reply" /\ remote' \in {"success", "failed", "blocked", "input-required"}
             /\ UNCHANGED <<dryRun, transport, sent, output>>
RequestLost == /\ phase = "inflight" /\ phase' = "uncertain" /\ remote' \in {"none", "success"}
               /\ UNCHANGED <<dryRun, transport, sent, output>>
ReportFailure == /\ phase \in {"reply", "uncertain"} /\ (remote # "success" \/ phase = "uncertain")
                 /\ phase' = "failed" /\ output' = "error"
                 /\ UNCHANGED <<dryRun, transport, sent, remote>>
PrepareOutput == /\ phase = "reply" /\ remote = "success" /\ phase' = "output"
                 /\ UNCHANGED <<dryRun, transport, sent, remote, output>>
WriteOutput == /\ phase = "output" /\ phase' = "done" /\ output' \in {"inline", "file"}
               /\ UNCHANGED <<dryRun, transport, sent, remote>>
OutputFails == /\ phase = "output" /\ phase' = "failed" /\ output' = "error"
               /\ UNCHANGED <<dryRun, transport, sent, remote>>
Done == /\ phase \in {"done", "failed"} /\ UNCHANGED vars
Next == ResolveContext \/ RejectInput \/ Validate \/ DrySummary \/ PermissionAllowed \/ PermissionDenied
        \/ SendTool \/ ToolReply \/ RequestLost \/ ReportFailure \/ PrepareOutput \/ WriteOutput \/ OutputFails \/ Done
DryRunDoesNotExecute == dryRun => sent = 0
=============================================================================
