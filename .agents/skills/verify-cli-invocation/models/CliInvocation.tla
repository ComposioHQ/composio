--------------------------- MODULE CliInvocation ---------------------------
EXTENDS Naturals
CONSTANT Mutant
VARIABLES phase, kind, hooks, invoked, failed, printed, reported
vars == <<phase, kind, hooks, invoked, failed, printed, reported>>
Init == /\ phase = "parse" /\ kind \in {"action", "help", "version", "parse-error", "bare-group"}
        /\ hooks = 0 /\ invoked = FALSE /\ failed = FALSE /\ printed = 0 /\ reported = FALSE
Parse == /\ phase = "parse" /\ phase' = "begin"
         /\ failed' = (kind = "parse-error") /\ printed' = IF kind = "parse-error" THEN 1 ELSE 0
         /\ reported' = (kind = "parse-error") /\ UNCHANGED <<kind, hooks, invoked>>
RunHooks == /\ phase = "begin" /\ (kind = "action" \/ Mutant) /\ phase' = "invoke" /\ hooks' = 1
            /\ UNCHANGED <<kind, invoked, failed, printed, reported>>
SkipHooks == /\ phase = "begin" /\ kind # "action" /\ ~Mutant /\ phase' = "invoke"
             /\ UNCHANGED <<kind, hooks, invoked, failed, printed, reported>>
RecordInvoked == /\ phase = "invoke" /\ phase' = "handle" /\ invoked' = TRUE
                 /\ UNCHANGED <<kind, hooks, failed, printed, reported>>
HandleSuccess == /\ phase = "handle" /\ kind # "parse-error" /\ phase' = "outcome"
                 /\ UNCHANGED <<kind, hooks, invoked, failed, printed, reported>>
HandleFailure == /\ phase = "handle" /\ kind = "action" /\ phase' = "outcome" /\ failed' = TRUE
                 /\ UNCHANGED <<kind, hooks, invoked, printed, reported>>
AlreadyPrintedFailure == /\ phase = "handle" /\ kind = "action"
                         /\ phase' = "outcome" /\ failed' = TRUE /\ printed' = 1 /\ reported' = TRUE
                         /\ UNCHANGED <<kind, hooks, invoked>>
ParseErrorOutcome == /\ phase = "handle" /\ kind = "parse-error" /\ phase' = "outcome"
                     /\ UNCHANGED <<kind, hooks, invoked, failed, printed, reported>>
RecordOutcome == /\ phase = "outcome" /\ phase' = "report"
                 /\ UNCHANGED <<kind, hooks, invoked, failed, printed, reported>>
PrintFailure == /\ phase = "report" /\ failed /\ ~reported /\ phase' = "runner" /\ printed' = 1 /\ reported' = TRUE
                /\ UNCHANGED <<kind, hooks, invoked, failed>>
NothingToPrint == /\ phase = "report" /\ (~failed \/ reported) /\ phase' = "runner"
                  /\ UNCHANGED <<kind, hooks, invoked, failed, printed, reported>>
Finish == /\ phase = "runner" /\ phase' = "done"
          /\ UNCHANGED <<kind, hooks, invoked, failed, printed, reported>>
Done == /\ phase = "done" /\ UNCHANGED vars
Next == Parse \/ RunHooks \/ SkipHooks \/ RecordInvoked \/ HandleSuccess \/ HandleFailure
        \/ AlreadyPrintedFailure \/ ParseErrorOutcome \/ RecordOutcome \/ PrintFailure \/ NothingToPrint \/ Finish \/ Done
HooksRequireParsedAction == hooks = 0 \/ kind = "action"
=============================================================================
