# Decision: no ML tool shipped

The pre-registered bar was: 5-fold CV ROC-AUC >= 0.65 AND permutation p < 0.05.

Measured: AUC = 0.465, permutation p = 0.680 (n = 370 completed
orders, 66 late). At this sample size the apparent structure (e.g. carrier delay
differences) is not separable from chance with enough confidence to put a probability in front
of an operations user — a confident-but-wrong risk score is worse than none.

What would change this: more data (10x orders), or a target with stronger drivers
(e.g. route-level transit times).
