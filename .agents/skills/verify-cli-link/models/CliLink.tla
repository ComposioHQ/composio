------------------------------- MODULE CliLink -------------------------------
EXTENDS Naturals
CONSTANT Mutant
VARIABLES phase, noWait, scenario, status, polls, output, requested
vars == <<phase, noWait, scenario, status, polls, output, requested>>
Init == /\ phase = "context" /\ noWait \in BOOLEAN
        /\ scenario \in {"first", "alias-conflict", "additional", "reuse"}
        /\ status = "INITIATED" /\ polls = 0 /\ output = "none" /\ requested = FALSE
ResolveScope == /\ phase = "context" /\ phase' = "alias"
                /\ UNCHANGED <<noWait, scenario, status, polls, output, requested>>
RejectAlias == /\ phase = "alias" /\ scenario = "alias-conflict" /\ phase' = "failed"
               /\ UNCHANGED <<noWait, scenario, status, polls, output, requested>>
CreateLink == /\ phase = "alias" /\ scenario # "alias-conflict" /\ phase' = "response" /\ requested' = TRUE
              /\ UNCHANGED <<noWait, scenario, status, polls, output>>
RejectIncomplete == /\ phase = "response" /\ phase' = "failed"
                    /\ UNCHANGED <<noWait, scenario, status, polls, output, requested>>
CheckAdditionalAccount == /\ phase = "response" /\ phase' = IF scenario = "additional" THEN "failed" ELSE "handoff"
                          /\ UNCHANGED <<noWait, scenario, status, polls, output, requested>>
ReturnPending == /\ phase = "handoff" /\ noWait /\ phase' = "done" /\ output' = "pending"
                 /\ UNCHANGED <<noWait, scenario, status, polls, requested>>
OpenAuthorization == /\ phase = "handoff" /\ ~noWait /\ phase' = "poll"
                     /\ UNCHANGED <<noWait, scenario, status, polls, output, requested>>
RetrieveAccount == /\ phase = "poll" /\ polls < 2 /\ status' \in {"INITIATED", "ACTIVE", "FAILED"}
                   /\ polls' = polls + 1 /\ phase' = "reply"
                   /\ UNCHANGED <<noWait, scenario, output, requested>>
ConfirmActive == /\ phase = "reply" /\ (status = "ACTIVE" \/ Mutant) /\ phase' = "done" /\ output' = "active"
                 /\ UNCHANGED <<noWait, scenario, status, polls, requested>>
Retry == /\ phase = "reply" /\ status # "ACTIVE" /\ ~Mutant /\ polls < 2 /\ phase' = "poll"
         /\ UNCHANGED <<noWait, scenario, status, polls, output, requested>>
Timeout == /\ phase = "reply" /\ status # "ACTIVE" /\ ~Mutant /\ polls = 2 /\ phase' = "failed"
           /\ UNCHANGED <<noWait, scenario, status, polls, output, requested>>
Done == /\ phase \in {"done", "failed"} /\ UNCHANGED vars
Next == ResolveScope \/ RejectAlias \/ CreateLink \/ RejectIncomplete \/ CheckAdditionalAccount
        \/ ReturnPending \/ OpenAuthorization \/ RetrieveAccount \/ ConfirmActive \/ Retry \/ Timeout \/ Done
ActiveOutputRequiresActiveAccount == output = "active" => status = "ACTIVE"
=============================================================================
