------------------------------- MODULE RunMain -------------------------------
(* The process around the CLI runner (src/run-main.ts): signals arrive, the
   shutdown deadline fires, and the main fiber ends, in any order.

   The runner's decisions are not written here. run-main.model.test.ts builds
   RunMainTransition from runnerTransition in src/run-main-transition.ts, so
   this model checks the code the CLI runs. Transition(received, finished, event)
   is <<received', finished', command, signal>>. *)
EXTENDS Naturals, RunMainTransition

Signals == {"SIGINT", "SIGTERM", "SIGHUP"}
Exits == {"Clean", "Failed"}

VARIABLES
  received,   \* the runner's first signal, or "none"
  finished,   \* the runner's own record that the process is ending
  cooperates, \* the signals the running command stops on by itself
  fiber,      \* "running", "stopping" (took a signal), "interrupted", "exited"
  listening,  \* the runner's signal handlers are installed
  deadline,   \* the one-shot shutdown deadline is armed
  signals,    \* signals delivered to the runner's handlers
  ends,       \* times the runner ended the process (exit, re-raise, or drain)
  event,      \* the last event: a signal, "Deadline", "Clean", "Failed", or "none"
  cause,      \* the signal behind the last event: itself, or the first signal for the deadline
  last,       \* the runner's last command
  signal      \* the signal the last command carries: offered (Stop) or reported (Force)

vars == <<received, finished, cooperates, fiber, listening, deadline, signals, ends,
          event, cause, last, signal>>

Init == /\ received = "none" /\ finished = FALSE
        /\ cooperates \in SUBSET Signals
        /\ fiber = "running" /\ listening = TRUE /\ deadline = FALSE
        /\ signals = 0 /\ ends = 0
        /\ event = "none" /\ cause = "none" /\ last = "none" /\ signal = "none"

(* One runner decision, and the platform effects run-main.ts performs for it.
   End and Drain act only on the fiber's exit, which supplies the exit action.
   Ending releases the handlers and cancels the deadline; firing consumes it. *)
Decide(e) ==
  LET t == Transition(received, finished, e)
      ending == t[3] = "Force" \/ (t[3] \in {"End", "Drain"} /\ e \in Exits)
  IN /\ received' = t[1] /\ finished' = t[2] /\ last' = t[3] /\ signal' = t[4]
     /\ event' = e /\ cause' = IF e \in Signals THEN e ELSE received
     /\ ends' = IF ending THEN ends + 1 ELSE ends
     /\ listening' = IF ending THEN FALSE ELSE listening
     /\ deadline' = IF ending \/ e = "Deadline" THEN FALSE ELSE deadline \/ t[3] = "Stop"

(* The runner offers the command's signal to a cooperating command; anything
   else interrupts the fiber. *)
Signal(s) ==
  /\ listening /\ signals' = signals + 1
  /\ Decide(s)
  /\ fiber' = IF last' = "Stop"
                THEN (IF signal' \in cooperates THEN "stopping" ELSE "interrupted")
                ELSE fiber
  /\ UNCHANGED cooperates

DeadlineFires ==
  /\ deadline /\ Decide("Deadline")
  /\ UNCHANGED <<cooperates, fiber, signals>>

(* An interrupted fiber never succeeds. A forced re-raise ends the process
   asynchronously, so the fiber may still report its exit afterwards. *)
FiberExits(clean) ==
  /\ fiber # "exited" /\ (clean => fiber # "interrupted")
  /\ fiber' = "exited"
  /\ Decide(IF clean THEN "Clean" ELSE "Failed")
  /\ UNCHANGED <<cooperates, signals>>

Next == \/ \E s \in Signals : Signal(s)
        \/ DeadlineFires
        \/ \E clean \in BOOLEAN : FiberExits(clean)

\* The process is ended once: no second exit code, re-raise, or drain.
EndsOnce == ends <= 1

\* Two signals always end the process, whatever the command does.
SecondSignalEnds == signals >= 2 => ends = 1

\* The shutdown deadline always ends the process.
DeadlineEnds == event = "Deadline" => ends = 1

\* A stop offers the signal that arrived; a forced exit reports the second signal,
\* or the first one when the deadline forced it (130, 143, 129).
CommandsCarryTheirSignal == last \in {"Stop", "Force"} => signal = cause

\* Only escalation forces the exit: a second signal, or the deadline. A first
\* signal goes to the command, and the fiber's exit ends with its own action.
ForcesOnlyOnEscalation ==
  last = "Force" => (event = "Deadline" \/ (event \in Signals /\ signals >= 2))

\* Only the fiber's exit, which carries the exit action, ends the process with it.
EndsWithActionOnlyOnExit == last \in {"End", "Drain"} => event \in Exits

\* Only a clean run that nobody signalled ends by draining the event loop.
DrainsOnlyUnsignalled == last = "Drain" => received = "none"

\* Until the process ends, something can still end it: the fiber or the deadline.
NeverStuck == ends = 0 => (fiber # "exited" \/ deadline)
=============================================================================
