---------------------------- MODULE CliListener ----------------------------
EXTENDS Naturals
CONSTANT Mutant
VARIABLES phase, temporary, accepted, pending, errors, stop, cleanup, disabled
vars == <<phase, temporary, accepted, pending, errors, stop, cleanup, disabled>>
Init == /\ phase = "start" /\ temporary \in BOOLEAN /\ accepted = 0 /\ pending = 0
        /\ errors = 0 /\ stop = "none" /\ cleanup = FALSE /\ disabled = FALSE
Acquire == /\ phase = "start" /\ phase' = "connecting"
           /\ UNCHANGED <<temporary, accepted, pending, errors, stop, cleanup, disabled>>
Subscribe == /\ phase = "connecting" /\ phase' = "listening"
             /\ UNCHANGED <<temporary, accepted, pending, errors, stop, cleanup, disabled>>
SubscriptionFails == /\ phase = "connecting" /\ phase' = "release" /\ stop' = "error"
                     /\ UNCHANGED <<temporary, accepted, pending, errors, cleanup, disabled>>
AcceptEvent == /\ phase = "listening" /\ accepted < 2 /\ accepted' = accepted + 1 /\ pending' = pending + 1
               /\ UNCHANGED <<phase, temporary, errors, stop, cleanup, disabled>>
WriteEvent == /\ phase \in {"listening", "draining"} /\ pending > 0 /\ pending' = pending - 1
              /\ UNCHANGED <<phase, temporary, accepted, errors, stop, cleanup, disabled>>
SinkFails == /\ phase \in {"listening", "draining"} /\ pending > 0 /\ pending' = pending - 1 /\ errors' = errors + 1
             /\ UNCHANGED <<phase, temporary, accepted, stop, cleanup, disabled>>
NormalStop == /\ phase = "listening" /\ stop' \in (IF accepted > 0 THEN {"limit", "timeout"} ELSE {"timeout"})
              /\ phase' = "draining" /\ UNCHANGED <<temporary, accepted, pending, errors, cleanup, disabled>>
SignalStop == /\ phase = "listening" /\ stop' = "signal" /\ phase' = "release" /\ pending' = 0
              /\ UNCHANGED <<temporary, accepted, errors, cleanup, disabled>>
FailFast == /\ phase \in {"listening", "draining"} /\ errors > 0 /\ stop' = "fail-fast" /\ phase' = "release" /\ pending' = 0
            /\ UNCHANGED <<temporary, accepted, errors, cleanup, disabled>>
FinishDrain == /\ phase = "draining" /\ pending = 0 /\ phase' = "release"
               /\ UNCHANGED <<temporary, accepted, pending, errors, stop, cleanup, disabled>>
DrainDeadline == /\ phase = "draining" /\ pending > 0 /\ phase' = "release" /\ pending' = 0
                 /\ UNCHANGED <<temporary, accepted, errors, stop, cleanup, disabled>>
ReleaseTrigger == /\ phase = "release" /\ phase' = "cleanup" /\ cleanup' = temporary
                  /\ UNCHANGED <<temporary, accepted, pending, errors, stop, disabled>>
CleanupReply == /\ phase = "cleanup" /\ phase' = "report" /\ disabled' \in (IF temporary THEN BOOLEAN ELSE {FALSE})
                /\ UNCHANGED <<temporary, accepted, pending, errors, stop, cleanup>>
SkipRelease == /\ phase = "release" /\ Mutant /\ phase' = "report"
               /\ UNCHANGED <<temporary, accepted, pending, errors, stop, cleanup, disabled>>
ReportStop == /\ phase = "report" /\ phase' = "done"
              /\ UNCHANGED <<temporary, accepted, pending, errors, stop, cleanup, disabled>>
ForceKill == /\ phase \in {"connecting", "listening", "draining", "release", "cleanup"} /\ phase' = "forced"
             /\ UNCHANGED <<temporary, accepted, pending, errors, stop, cleanup, disabled>>
Done == /\ phase \in {"done", "forced"} /\ UNCHANGED vars
Next == Acquire \/ Subscribe \/ SubscriptionFails \/ AcceptEvent \/ WriteEvent \/ SinkFails
        \/ NormalStop \/ SignalStop \/ FailFast \/ FinishDrain \/ DrainDeadline \/ ReleaseTrigger \/ CleanupReply \/ SkipRelease \/ ReportStop \/ ForceKill \/ Done
CleanupAttemptBeforeCompletion == (phase = "done" /\ temporary) => cleanup
=============================================================================
