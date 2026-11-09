---------------------------- MODULE CliShutdown ----------------------------
EXTENDS Naturals
CONSTANT Mutant
VARIABLES phase, mode, registered, first, interrupted, escalation, child, exit
vars == <<phase, mode, registered, first, interrupted, escalation, child, exit>>
Init == /\ phase = "running" /\ mode \in {"listener", "run", "ordinary"} /\ registered = FALSE
        /\ first = "none" /\ interrupted = FALSE /\ escalation = 0 /\ child = "running" /\ exit = "none"
Register == /\ phase = "running" /\ ~registered /\ mode # "ordinary" /\ registered' = TRUE
            /\ UNCHANGED <<phase, mode, first, interrupted, escalation, child, exit>>
Takes(s) == registered /\ (mode = "run" \/ (mode = "listener" /\ s # "HUP"))
FirstSignal == /\ phase = "running" /\ first' \in {"INT", "TERM", "HUP"} /\ phase' = "stopping"
               /\ interrupted' = IF Mutant THEN Takes(first') ELSE ~Takes(first')
               /\ UNCHANGED <<mode, registered, escalation, child, exit>>
ChildGrace == /\ phase = "stopping" /\ mode = "run" /\ ~interrupted /\ child = "running" /\ escalation < 2
              /\ escalation' = escalation + 1 /\ UNCHANGED <<phase, mode, registered, first, interrupted, child, exit>>
ChildExits == /\ phase = "stopping" /\ mode = "run" /\ ~interrupted /\ child = "running"
              /\ child' \in {"code-zero", "code-seven", "signal", "crash"}
              /\ UNCHANGED <<phase, mode, registered, first, interrupted, escalation, exit>>
MirrorChild == /\ phase = "stopping" /\ mode = "run" /\ ~interrupted /\ child # "running"
               /\ phase' = "done" /\ exit' = child
               /\ UNCHANGED <<mode, registered, first, interrupted, escalation, child>>
ListenerStops == /\ phase = "stopping" /\ mode = "listener" /\ ~interrupted /\ phase' = "done" /\ exit' = "code-zero"
                 /\ UNCHANGED <<mode, registered, first, interrupted, escalation, child>>
InterruptEnds == /\ phase = "stopping" /\ interrupted /\ phase' = "interrupted" /\ exit' = "128-plus-first"
                 /\ UNCHANGED <<mode, registered, first, interrupted, escalation, child>>
Force == /\ phase = "stopping" /\ phase' = "forced" /\ child' = IF mode = "run" /\ registered THEN "killed" ELSE child
         /\ exit' = IF mode = "run" /\ registered THEN "reraise" ELSE "128-plus-forcing-signal"
         /\ UNCHANGED <<mode, registered, first, interrupted, escalation>>
NaturalExit == /\ phase = "running" /\ phase' = "done" /\ child' \in {"code-zero", "code-seven", "signal", "crash"}
               /\ exit' = child' /\ UNCHANGED <<mode, registered, first, interrupted, escalation>>
Done == /\ phase \in {"done", "interrupted", "forced"} /\ UNCHANGED vars
Next == NaturalExit \/ Register \/ FirstSignal \/ ChildGrace \/ ChildExits \/ MirrorChild \/ ListenerStops \/ InterruptEnds \/ Force \/ Done
CooperativeSignalIsNotInterruption == (first # "none" /\ Takes(first)) => ~interrupted
=============================================================================
