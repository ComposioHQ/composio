---------------------------- MODULE CliRouting ----------------------------
EXTENDS Naturals
CONSTANT Mutant
VARIABLES phase, tree, project, user, scenario, selected
vars == <<phase, tree, project, user, scenario, selected>>
Init == /\ phase = "start" /\ tree \in {"root", "dev"}
        /\ scenario \in {"none", "one", "default", "ambiguous", "explicit", "miss"}
        /\ project = "none" /\ user = "none" /\ selected = "none"
ResolveProject == /\ phase = "start" /\ phase' = "project"
                  /\ project' = IF tree = "root" THEN "consumer" ELSE "developer"
                  /\ UNCHANGED <<tree, user, scenario, selected>>
MissingProject == /\ phase = "start" /\ phase' = "failed"
                  /\ UNCHANGED <<tree, project, user, scenario, selected>>
ResolveUser == /\ phase = "project" /\ phase' = "account"
               /\ user' \in (IF tree = "root" THEN {"consumer"} ELSE {"flag", "directory", "global"})
               /\ UNCHANGED <<tree, project, scenario, selected>>
MissingUser == /\ phase = "project" /\ phase' = "failed"
               /\ UNCHANGED <<tree, project, user, scenario, selected>>
SelectAccount == /\ phase = "account" /\ scenario \in {"one", "default", "explicit"}
                 /\ selected' = scenario /\ phase' = "ready"
                 /\ UNCHANGED <<tree, project, user, scenario>>
NoAccount == /\ phase = "account" /\ scenario = "none" /\ phase' = "unconnected"
             /\ UNCHANGED <<tree, project, user, scenario, selected>>
RejectSelector == /\ phase = "account" /\ scenario = "miss" /\ phase' = "failed"
                  /\ UNCHANGED <<tree, project, user, scenario, selected>>
RejectAmbiguity == /\ phase = "account" /\ scenario = "ambiguous" /\ ~Mutant /\ phase' = "failed"
                   /\ UNCHANGED <<tree, project, user, scenario, selected>>
GuessNewest == /\ phase = "account" /\ scenario = "ambiguous" /\ Mutant
               /\ phase' = "ready" /\ selected' = "newest"
               /\ UNCHANGED <<tree, project, user, scenario>>
Done == /\ phase \in {"ready", "failed", "unconnected"} /\ UNCHANGED vars
Next == ResolveProject \/ MissingProject \/ ResolveUser \/ MissingUser \/ SelectAccount
        \/ NoAccount \/ RejectSelector \/ RejectAmbiguity \/ GuessNewest \/ Done
NoAmbiguousAccountChosen == ~(scenario = "ambiguous" /\ selected # "none")
=============================================================================
