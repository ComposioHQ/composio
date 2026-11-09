----------------------------- MODULE CliLogin -----------------------------
EXTENDS Naturals
CONSTANT Mutant
VARIABLES phase, flow, status, polls, cached, verified, persisted
vars == <<phase, flow, status, polls, cached, verified, persisted>>
Init == /\ phase = "start" /\ flow \in {"interactive", "headless", "direct", "agent"}
        /\ status = "pending" /\ polls = 0 /\ cached = FALSE
        /\ verified = FALSE /\ persisted = FALSE
CreateSession == /\ phase = "start" /\ flow \in {"interactive", "headless"}
                 /\ phase' = "cache" /\ UNCHANGED <<flow, status, polls, cached, verified, persisted>>
CacheHandoff == /\ phase = "cache" /\ phase' = "waiting" /\ cached' = TRUE
                /\ UNCHANGED <<flow, status, polls, verified, persisted>>
CheckDirectKey == /\ phase = "start" /\ flow \in {"direct", "agent"}
                  /\ phase' \in {"verified", "failed"}
                  /\ verified' = (phase' = "verified")
                  /\ UNCHANGED <<flow, status, polls, cached, persisted>>
ResumeHandoff == /\ phase = "waiting" /\ phase' = "polling"
                 /\ UNCHANGED <<flow, status, polls, cached, verified, persisted>>
CacheExpires == /\ phase = "waiting" /\ flow = "headless"
                /\ phase' = "expired" /\ cached' = FALSE
                /\ UNCHANGED <<flow, status, polls, verified, persisted>>
PollReply == /\ phase = "polling" /\ polls < 2
             /\ status' \in {"pending", "linked", "expired", "request-failed"}
             /\ polls' = polls + 1 /\ phase' = "reply"
             /\ UNCHANGED <<flow, cached, verified, persisted>>
RequireLinked == /\ phase = "reply" /\ (status = "linked" \/ Mutant)
                 /\ phase' = "verified" /\ verified' = (status = "linked")
                 /\ UNCHANGED <<flow, status, polls, cached, persisted>>
Retry == /\ phase = "reply" /\ status # "linked" /\ ~Mutant /\ polls < 2
         /\ phase' = "polling" /\ UNCHANGED <<flow, status, polls, cached, verified, persisted>>
GiveUp == /\ phase = "reply" /\ status # "linked" /\ ~Mutant /\ polls = 2
          /\ phase' = "failed" /\ UNCHANGED <<flow, status, polls, cached, verified, persisted>>
PersistCredentials == /\ phase = "verified" /\ phase' = "saved" /\ persisted' = TRUE
                      /\ UNCHANGED <<flow, status, polls, cached, verified>>
StoreFails == /\ phase = "verified" /\ phase' = "failed"
              /\ UNCHANGED <<flow, status, polls, cached, verified, persisted>>
Finish == /\ phase = "saved" /\ phase' = "done"
          /\ cached' = IF flow = "headless" THEN FALSE ELSE cached
          /\ UNCHANGED <<flow, status, polls, verified, persisted>>
Done == /\ phase \in {"done", "failed", "expired"} /\ UNCHANGED vars
Next == CreateSession \/ CacheHandoff \/ CheckDirectKey \/ ResumeHandoff \/ CacheExpires
        \/ PollReply \/ RequireLinked \/ Retry \/ GiveUp \/ PersistCredentials \/ StoreFails \/ Finish \/ Done
BrowserSessionMustBeLinked == (flow \in {"interactive", "headless"} /\ phase \in {"verified", "saved", "done"}) => status = "linked"
=============================================================================
